-- ============================================================================
-- `neo_perms_for_email` — as permissões de uma pessoa consultadas SEM o JWT dela.
--
-- POR QUE ISTO PRECISA EXISTIR: o Nero é server-rendered e o `proxy.ts` só tem o cookie
-- `neo_session` (HttpOnly, assinado pelo portal). Ele NÃO tem o JWT do Supabase, então não
-- consegue perguntar "esta pessoa pode?" como a pessoa. Quem pergunta por ele é `/api/authz`,
-- uma function do portal — e ela também não tem JWT nenhum.
--
-- O QUE NÃO FAZER, E POR QUE ESTÁ ESCRITO AQUI: a saída óbvia seria a function consultar com
-- `service_role`. Foi exatamente esse o P0 do review de 2026-07-27 — `sync-anchors` recebia
-- `service_role` por env e autorizava com ela, então qualquer portador da anon key (que é
-- pública, e está no histórico do git) acionava uma função privilegiada. Repetir o padrão aqui
-- seria reabrir o mesmo buraco num lugar mais central.
--
-- A SAÍDA É A MESMA QUE O REPO JÁ ADOTOU PARA FECHAR AQUELE P0: `security definer` + segredo
-- do Vault. Quem chama pode ser `anon` — o que autoriza não é o papel, é conhecer o segredo,
-- que vive só no Vault e na env do projeto Vercel `neo-lm`. Sem o segredo certo a função
-- devolve `{}`, que o chamador lê como "não pode". Nunca lança: erro seria informação.
--
-- PRÉ-REQUISITO OPERACIONAL — ANTES de aplicar em produção (ver SECRETS.md):
--   select vault.create_secret('<segredo longo e aleatório>', 'neo_authz_secret');
-- E o MESMO valor no projeto Vercel do portal:
--   vercel env add NEO_AUTHZ_SECRET production
--
-- ⚠️ Os dois têm de ter o valor IDÊNTICO. Divergiram? A função devolve `{}` para todo mundo e
-- o Nero fecha para todo mundo, em silêncio — é a mesma pegadinha que `anchor_sync_secret`
-- já pregou uma vez. O nome no Vault é `neo_authz_secret` (e não `authz_secret`, como dizia o
-- rascunho do plano) para não colidir com os segredos do sync de âncoras no mesmo Vault.
--
-- Por que uma migration separada de `20260731120000_neo_rbac.sql`: aquela é o modelo, esta é a
-- porta de serviço. Rollback independente — dá para tirar `/api/authz` do ar sem desmontar o
-- RBAC inteiro.
-- ============================================================================

begin;

create or replace function public.neo_perms_for_email(p_email text, p_secret text)
returns text[]
language plpgsql
stable
security definer
set search_path = public, vault, pg_temp
as $$
declare
  v_expected text;
  v_email    text := lower(nullif(btrim(p_email), ''));
begin
  -- Entrada inútil sai cedo, e sai igual ao caso "não autorizado": quem chama não distingue
  -- "e-mail vazio" de "segredo errado", e não precisa.
  if v_email is null or p_secret is null or p_secret = '' then
    return '{}'::text[];
  end if;

  -- `vault.decrypted_secrets` é a view que decifra sob demanda; só o dono da função a lê.
  select decrypted_secret into v_expected
    from vault.decrypted_secrets
   where name = 'neo_authz_secret';

  -- FAIL-CLOSED. Vault sem o segredo, ou com um segredo curto demais para ser levado a sério,
  -- fecha a porta. O contrário — cair para "sem segredo configurado, então libera" — é o modo
  -- de falha que transforma um deploy incompleto em acesso aberto.
  if v_expected is null or length(v_expected) < 32 then
    return '{}'::text[];
  end if;

  -- Comparação sobre o digest, não sobre o segredo. `md5()` é core do Postgres (nada de
  -- depender de pgcrypto estar instalado) e serve ao propósito de igualar o comprimento: os
  -- dois lados viram sempre 32 caracteres hex, então o tempo do `<>` não conta quantos
  -- caracteres do PREFIXO o atacante acertou. O md5 aqui não guarda nada nem prova nada
  -- criptograficamente — é só o equalizador de comprimento.
  if md5(v_expected) <> md5(p_secret) then
    return '{}'::text[];
  end if;

  -- Mesmo conjunto que `my_permissions()`, porém resolvido por E-MAIL em vez de por
  -- `auth.jwt()`: papéis globais concedidos e não revogados, mais o papel implícito `todos`
  -- quando o e-mail está na allowlist do NEO.
  --
  -- NÃO inclui permissão de squad, e isso é deliberado: `/api/authz` responde por PORTA
  -- ("pode entrar no Nero?"), que é sempre autoridade global. Permissão dentro de um squad
  -- depende de qual squad, e quem pergunta isso tem o JWT e chama `my_squad_permissions()`.
  return coalesce(array(
    select distinct rp.permission_id
      from public.neo_role_permissions rp
     where rp.role_id in (
             select pr.role
               from public.portal_roles pr
              where pr.email = v_email
                and pr.revoked_at is null
           )
        or (rp.role_id = 'todos' and public.is_neo_email_allowed(v_email))
     order by rp.permission_id
  ), '{}'::text[]);
end;
$$;

comment on function public.neo_perms_for_email(text, text) is
  'Permissões GLOBAIS de um e-mail, para o /api/authz do portal, que não tem JWT do usuário. '
  'Autoriza por segredo do Vault (neo_authz_secret), nunca por service_role — ver o P0 do '
  'sync-anchors no review de 2026-07-27. Segredo errado ou ausente devolve {}.';

-- OS DOIS REVOKES SÃO NECESSÁRIOS: o bootstrap do Supabase faz `grant all on all routines`
-- EXPLÍCITO ao papel `anon`, e `revoke ... from public` não o alcança. Documentado em
-- 20260727130000 e reincidido em 20260731120000 — aqui já sai certo.
revoke all on function public.neo_perms_for_email(text, text) from public, anon, authenticated;

-- E então concede de volta, DE PROPÓSITO, inclusive a `anon`: quem chama é uma function
-- serverless com a anon key e sem usuário. O papel não autoriza nada — o segredo é que
-- autoriza, e sem ele o retorno é `{}`. Conceder a `anon` sem o gate do segredo seria
-- publicar a matriz de permissões de qualquer pessoa da empresa.
grant execute on function public.neo_perms_for_email(text, text) to anon, authenticated;

commit;
