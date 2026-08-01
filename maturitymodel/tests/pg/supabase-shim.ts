/**
 * Camada mínima do Supabase sobre Postgres puro, para rodar as migrations do MMA em
 * PGlite (Postgres compilado em WASM — sem Docker, sem nuvem, sem credencial).
 *
 * POR QUE ISTO EXISTE: RLS, triggers, policies e `security definer` são **núcleo do
 * Postgres**, não features do Supabase. O que o Supabase acrescenta e as migrations usam
 * é uma superfície pequena — medida, não suposta: `auth.uid()` (73×), `auth.users` (18×),
 * `auth.jwt()` (7×) e os papéis `anon`/`authenticated`/`service_role`. Emulando esses,
 * as políticas de acesso podem ser exercitadas de verdade numa máquina qualquer.
 *
 * O QUE ISTO **NÃO** PROVA: comportamento do GoTrue (login, OTP, refresh), Realtime,
 * Storage, e o `pg_cron`/`pg_net` do sync de âncoras. Também não prova que o estado da
 * PRODUÇÃO casa com a soma das migrations — só que as migrations, aplicadas em ordem
 * num banco vazio, produzem o schema e as permissões esperados.
 */
import { PGlite } from "@electric-sql/pglite";

/** Como o Supabase expõe os claims do JWT: uma GUC por requisição. */
export const CLAIMS_GUC = "request.jwt.claims";

export interface Identity {
  sub?: string;
  email?: string;
  role?: "anon" | "authenticated" | "service_role";
}

export async function createSupabaseLikeDb(): Promise<PGlite> {
  const db = new PGlite();

  // ── Papéis do Supabase ────────────────────────────────────────────────────
  // `authenticated` NÃO é owner das tabelas e não é superuser, então a RLS se aplica a
  // ele — que é exatamente o que queremos exercitar. `service_role` recebe BYPASSRLS,
  // como no Supabase (é o papel dos scripts de manutenção e dos seeds).
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create role authenticator noinherit login;
    grant anon, authenticated, service_role to authenticator;
  `);

  // ── Schema auth ───────────────────────────────────────────────────────────
  // `auth.uid()` e `auth.jwt()` leem a GUC de claims, igual ao Supabase. O `true` no
  // segundo argumento de current_setting evita erro quando a GUC não foi definida
  // (requisição anônima) — sem ele, toda policy explodiria em vez de negar.
  await db.exec(`
    create schema if not exists auth;

    -- Só as colunas que as migrations realmente referenciam (medido: id, email,
    -- raw_user_meta_data) mais as que um trigger de onboarding costuma ler. Replicar a
    -- auth.users inteira do GoTrue seria inventar contrato: o que interessa aqui é o
    -- schema public e suas policies.
    create table auth.users (
      id                 uuid primary key,
      email              text unique,
      raw_user_meta_data jsonb not null default '{}'::jsonb,
      raw_app_meta_data  jsonb not null default '{}'::jsonb,
      created_at         timestamptz not null default now()
    );

    create or replace function auth.jwt() returns jsonb
    language sql stable as $$
      select coalesce(
        nullif(current_setting('${CLAIMS_GUC}', true), '')::jsonb,
        '{}'::jsonb
      );
    $$;

    create or replace function auth.uid() returns uuid
    language sql stable as $$
      select nullif(auth.jwt() ->> 'sub', '')::uuid;
    $$;

    create or replace function auth.role() returns text
    language sql stable as $$
      select auth.jwt() ->> 'role';
    $$;

    grant usage on schema auth to anon, authenticated, service_role;
    grant select on auth.users to anon, authenticated, service_role;
  `);

  // ── Schema vault ──────────────────────────────────────────────────────────
  // Superfície mínima do Supabase Vault: a view `decrypted_secrets`, que é como o SQL do repo
  // lê um segredo (`20260727130100` faz o mesmo para o cron das âncoras).
  //
  // Por que emular em vez de pular a migration: sem isto, `20260731130000_neo_authz_rpc.sql`
  // teria de entrar na lista de SKIP, e a função que decide "esta pessoa pode entrar no Nero?"
  // ficaria sem NENHUM teste — justo a que substitui uma senha compartilhada. Com a view
  // emulada, o gate do segredo é exercitado de verdade: certo → permissões, errado → {}.
  //
  // ⚠️ SEM GRANT para anon/authenticated, igual ao Vault real. Se algum dia uma migration ler
  // o Vault fora de `security definer`, o teste falha por permissão — que é o que se quer.
  await db.exec(`
    create schema if not exists vault;

    create table vault.decrypted_secrets (
      name             text primary key,
      decrypted_secret text not null
    );

    grant usage on schema vault to service_role;
    grant select on vault.decrypted_secrets to service_role;
  `);

  return db;
}

/**
 * Semeia um segredo no Vault emulado. O valor precisa ter ao menos 32 caracteres: a função
 * `neo_perms_for_email` recusa segredo curto, e um teste que semeasse 'abc' provaria o
 * caminho errado.
 */
export async function seedVaultSecret(db: PGlite, name: string, value: string): Promise<void> {
  await db.query(
    `insert into vault.decrypted_secrets (name, decrypted_secret) values ($1, $2)
       on conflict (name) do update set decrypted_secret = excluded.decrypted_secret`,
    [name, value],
  );
}

/**
 * Concede os privilégios de TABELA que o Supabase dá por padrão (via `alter default
 * privileges` no projeto). Sem isto tudo seria negado por falta de GRANT, e não pela
 * RLS — um falso "seguro" que esconderia policies erradas.
 * Rodar DEPOIS das migrations, porque elas criam tabelas.
 */
export async function grantSupabaseDefaults(db: PGlite): Promise<void> {
  await db.exec(`
    grant usage on schema public to anon, authenticated, service_role;
    grant all on all tables    in schema public to anon, authenticated, service_role;
    grant all on all sequences in schema public to anon, authenticated, service_role;
    grant all on all routines  in schema public to anon, authenticated, service_role;
  `);
}

/** Executa `fn` como uma identidade autenticada, do jeito que o PostgREST monta a request. */
export async function asUser<T>(
  db: PGlite,
  identity: Identity,
  fn: () => Promise<T>,
): Promise<T> {
  const role = identity.role ?? "authenticated";
  const claims = JSON.stringify({
    sub: identity.sub,
    email: identity.email,
    role,
  });
  // `set local` dentro de uma transação: some no commit/rollback, como numa request.
  await db.exec("begin");
  try {
    await db.query(`set local role ${role}`);
    await db.query(`select set_config('${CLAIMS_GUC}', $1, true)`, [claims]);
    const out = await fn();
    await db.exec("commit");
    return out;
  } catch (e) {
    await db.exec("rollback").catch(() => undefined);
    throw e;
  }
}

/** Cria um usuário em auth.users + profiles (o app espera o profile para nome/e-mail). */
export async function makeUser(
  db: PGlite,
  id: string,
  email: string,
  fullName = email,
): Promise<{ id: string; email: string }> {
  await db.query(`insert into auth.users (id, email) values ($1, $2)`, [id, email]);
  await db.query(
    `insert into profiles (id, email, full_name) values ($1, $2, $3)
       on conflict (id) do update set email = excluded.email`,
    [id, email, fullName],
  );
  return { id, email };
}
