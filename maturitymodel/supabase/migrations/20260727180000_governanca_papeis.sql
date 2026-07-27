-- ============================================================================
-- Governança de papéis e de ações destrutivas (achados 6.4, 6.6 e 6.7 do review de
-- 2026-07-27).
--
-- Cinco problemas, cada um com natureza diferente:
--
--   1. LOCKOUT: `portal_roles_write` permite ao admin apagar QUALQUER linha — inclusive a
--      última de `role='admin'`. O resultado é irrecuperável pela aplicação: sem admin, ninguém
--      concede admin. Só service_role no SQL editor resolve. É risco de disponibilidade, não de
--      confidencialidade — e o tipo de erro que se comete às 18h de uma sexta.
--   2. CONCESSÃO SEM RASTRO: a tabela tem `created_at` e `note`, mas não QUEM concedeu nem se
--      houve revogação. Offboarding fica sem prova: "o acesso do fulano foi retirado quando?"
--      não tem resposta no banco.
--   3. E-MAIL COMO IDENTIDADE: `portal_roles` liga papel a e-mail, sem FK para `auth.users`.
--      É decisão pragmática (permite conceder antes do primeiro login) e continua valendo — mas
--      sem reconciliação, troca de e-mail deixa grant órfão e ninguém percebe.
--   4. KAIZEN APAGÁVEL POR QUALQUER MEMBRO: `kz_write ... for all` dá INSERT/UPDATE/DELETE a
--      todo membro do squad. O plano de ação é artefato governado — e os kaizens gerados na
--      OFICIALIZAÇÃO são resultado de ritual, não rascunho.
--   5. RESET SEM HISTÓRICO: `restart_assessment` apaga kaizens, homologações, propostas e
--      pré-sessão. É admin-only e transacional (isso está certo), mas não registra quem
--      reiniciou, por quê, nem o que havia antes. A autorização está resolvida; a GOVERNANÇA e
--      a recuperação, não.
-- ============================================================================
begin;

-- ────────────────────────────────────────────────────────────
-- 1. Guarda do ÚLTIMO admin
-- ────────────────────────────────────────────────────────────
create or replace function public.protect_last_admin() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_restantes int;
begin
  -- Só interessa quando a operação REMOVE um admin: delete, ou update que troca o papel.
  if (tg_op = 'DELETE' and old.role = 'admin')
     or (tg_op = 'UPDATE' and old.role = 'admin' and new.role <> 'admin') then
    select count(*) into v_restantes
      from public.portal_roles
     where role = 'admin'
       and email <> old.email;
    if v_restantes = 0 then
      raise exception
        'não é possível remover o último admin do portal (%). Conceda admin a outra pessoa antes.',
        old.email;
    end if;
  end if;
  return coalesce(new, old);
end
$$;

drop trigger if exists protect_last_admin_trg on public.portal_roles;
create trigger protect_last_admin_trg
  before delete or update on public.portal_roles
  for each row execute function public.protect_last_admin();

-- ────────────────────────────────────────────────────────────
-- 2 e 3. Rastro de concessão/revogação e reconciliação com auth.users
-- ────────────────────────────────────────────────────────────
alter table public.portal_roles
  add column if not exists granted_by text,
  add column if not exists revoked_at timestamptz,
  add column if not exists revoked_by text,
  add column if not exists revoke_reason text,
  -- Resolvido no PRIMEIRO login (ver `reconcile_portal_role_user`). Nullable de propósito:
  -- conceder acesso a quem ainda não entrou é o caso de uso que justifica o e-mail como chave.
  add column if not exists user_id uuid references auth.users(id) on delete set null;

comment on column public.portal_roles.user_id is
  'Preenchido no primeiro login pelo RPC reconcile_portal_role_user. Detecta grant órfão: '
  'e-mail que nunca virou usuário, ou usuário cujo e-mail mudou.';

-- Quem concedeu, gravado pelo próprio banco. Confiar na aplicação para preencher isso é o
-- mesmo que não ter o campo: basta um caminho de escrita esquecer.
create or replace function public.stamp_portal_role_grant() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.granted_by := coalesce(new.granted_by, lower(auth.jwt() ->> 'email'));
  elsif tg_op = 'UPDATE' and new.revoked_at is not null and old.revoked_at is null then
    new.revoked_by := coalesce(new.revoked_by, lower(auth.jwt() ->> 'email'));
  end if;
  return new;
end
$$;

drop trigger if exists stamp_portal_role_grant_trg on public.portal_roles;
create trigger stamp_portal_role_grant_trg
  before insert or update on public.portal_roles
  for each row execute function public.stamp_portal_role_grant();

/**
 * Papel REVOGADO deixa de valer, mesmo com a linha ainda na tabela.
 *
 * Manter a linha é deliberado: apagar destrói a prova de que o acesso existiu, que é
 * justamente o que o offboarding precisa demonstrar. Então os predicados passam a exigir
 * `revoked_at is null` — sem isso, "revogar" seria decorativo.
 */
create or replace function public.is_portal_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    exists (select 1 from public.portal_roles
             where role = 'admin'
               and revoked_at is null
               and email = lower(auth.jwt() ->> 'email')),
    false
  );
$$;

create or replace function public.is_portal_am() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    exists (select 1 from public.portal_roles
             where role = 'am'
               and revoked_at is null
               and email = lower(auth.jwt() ->> 'email')),
    false
  ) or public.is_portal_admin();
$$;

-- Reconciliação: chamada pela app no login. Liga o grant ao usuário de verdade.
create or replace function public.reconcile_portal_role_user() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(auth.jwt() ->> 'email');
begin
  if v_email is null or auth.uid() is null then return; end if;
  update public.portal_roles
     set user_id = auth.uid()
   where email = v_email
     and (user_id is null or user_id <> auth.uid());
end
$$;

revoke all on function public.reconcile_portal_role_user() from public;
grant execute on function public.reconcile_portal_role_user() to authenticated;

-- Grants órfãos: e-mail com papel que nunca virou usuário. Vira item de revisão periódica em
-- vez de acúmulo silencioso.
create or replace view public.v_portal_roles_orfaos as
  select pr.email, pr.role, pr.created_at, pr.granted_by
    from public.portal_roles pr
   where pr.revoked_at is null
     and pr.user_id is null
     and not exists (select 1 from auth.users u where lower(u.email) = pr.email);

comment on view public.v_portal_roles_orfaos is
  'Papéis concedidos a e-mail que nunca fez login (ou cujo e-mail mudou). Revisar periodicamente: '
  'o e-mail como chave permite conceder antes do primeiro acesso, e o preço é este resíduo.';

-- ────────────────────────────────────────────────────────────
-- 4. Kaizen: separar criar/atualizar de EXCLUIR
-- ────────────────────────────────────────────────────────────
-- Membro do squad continua criando e atualizando (é o plano DELE, e execução é do time).
-- Excluir passa a ser de admin: kaizen gerado na oficialização é resultado de ritual, e
-- apagá-lo desfaz decisão coletiva sem deixar rastro.
drop policy if exists kz_write on kaizens;

create policy kz_insert on kaizens for insert to authenticated
  with check (is_member(team_id) or is_portal_am());
create policy kz_update on kaizens for update to authenticated
  using (is_member(team_id) or is_portal_am())
  with check (is_member(team_id) or is_portal_am());
create policy kz_delete on kaizens for delete to authenticated
  using (is_portal_admin());

-- ────────────────────────────────────────────────────────────
-- 5. Trilha das ações destrutivas
-- ────────────────────────────────────────────────────────────
create table if not exists public.destructive_audit (
  id           uuid primary key default gen_random_uuid(),
  action       text not null,                -- restart_assessment | delete_squad
  team_id      uuid,
  cycle_id     uuid,
  actor_email  text,
  actor_id     uuid,
  reason       text,
  -- Snapshot do que foi apagado. Não é backup completo: é o suficiente para reconstruir
  -- manualmente e para responder "o que existia antes?".
  snapshot     jsonb,
  created_at   timestamptz not null default now()
);

alter table public.destructive_audit enable row level security;

comment on table public.destructive_audit is
  'Trilha de ações destrutivas. Append-only por policy: quem executa não pode apagar o próprio '
  'rastro — uma trilha que o autor edita não é trilha.';

drop policy if exists destructive_audit_read on public.destructive_audit;
create policy destructive_audit_read on public.destructive_audit for select to authenticated
  using (is_portal_am());
-- Sem policy de INSERT/UPDATE/DELETE para `authenticated`: só as funções SECURITY DEFINER
-- escrevem. RLS habilitada sem policy = ninguém escreve direto, que é o desejado.

-- `restart_assessment` agora exige MOTIVO e grava snapshot antes de apagar.
create or replace function restart_assessment(p_team uuid, p_reason text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_cycle uuid;
  v_snapshot jsonb;
begin
  if not is_portal_admin() then
    raise exception 'apenas o admin do portal pode reiniciar assessments';
  end if;

  -- Motivo OBRIGATÓRIO: ação destrutiva sem justificativa registrada é o que torna a auditoria
  -- inútil depois ("reiniciaram, mas por quê?").
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'informe o motivo do reinício (p_reason) — a ação é destrutiva e auditada';
  end if;

  select id into v_cycle
    from assessment_cycles
   where team_id = p_team
   order by quarter desc, created_at desc
   limit 1
   for update;

  if v_cycle is null then
    raise exception 'nenhum assessment encontrado para este squad';
  end if;

  -- Snapshot ANTES do delete, na mesma transação: se o reinício abortar, nada é registrado.
  select jsonb_build_object(
           'cycle',        (select to_jsonb(c) from assessment_cycles c where c.id = v_cycle),
           'proposals',    coalesce((select jsonb_agg(to_jsonb(p)) from proposals p where p.cycle_id = v_cycle), '[]'::jsonb),
           'homologations',coalesce((select jsonb_agg(to_jsonb(h)) from homologations h where h.cycle_id = v_cycle), '[]'::jsonb),
           'kaizens',      coalesce((select jsonb_agg(to_jsonb(k)) from kaizens k where k.cycle_id = v_cycle), '[]'::jsonb),
           'pre_session',  coalesce((select jsonb_agg(to_jsonb(s)) from pre_session_assessments s where s.cycle_id = v_cycle), '[]'::jsonb)
         )
    into v_snapshot;

  insert into public.destructive_audit (action, team_id, cycle_id, actor_email, actor_id, reason, snapshot)
  values ('restart_assessment', p_team, v_cycle,
          lower(auth.jwt() ->> 'email'), auth.uid(), btrim(p_reason), v_snapshot);

  delete from kaizens where cycle_id = v_cycle;
  delete from homologations where cycle_id = v_cycle;
  delete from proposals where cycle_id = v_cycle;
  delete from pre_session_assessments where cycle_id = v_cycle;

  -- Destino 'pre_session' e `workshop_at = null`, preservando o comportamento corrigido em
  -- 26/07: o ciclo NASCE em pre_session desde 24/07, então resetar para 'session' pularia a
  -- análise prévia do SM, e `workshop_at = now()` afirmaria uma sessão que não aconteceu.
  -- (Esta função é reescrita inteira aqui para ganhar motivo + snapshot; o corpo TEM de manter
  -- o destino certo, senão o hardening reintroduz um bug já corrigido.)
  update assessment_cycles
     set status = 'pre_session',
         workshop_at = null,
         officialized_at = null,
         homologated_by = null
   where id = v_cycle;

  return v_cycle;
end
$$;

revoke all on function restart_assessment(uuid, text) from public;
grant execute on function restart_assessment(uuid, text) to authenticated;

-- A assinatura de 1 argumento sai de cena: mantê-la deixaria um caminho SEM motivo e SEM
-- auditoria, que é exatamente o que esta migration fecha.
drop function if exists restart_assessment(uuid);

commit;
