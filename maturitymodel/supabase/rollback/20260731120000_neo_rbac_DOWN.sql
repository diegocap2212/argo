-- ============================================================================
-- ROLLBACK de 20260731120000_neo_rbac.sql
--
-- NÃO ESTÁ EM supabase/migrations DE PROPÓSITO: se estivesse, o `db push` a aplicaria em
-- sequência e desfaria a migration no mesmo deploy. Rodar À MÃO, e só se for preciso reverter.
--
-- O QUE ESTE SCRIPT RESTAURA: o modelo de papéis de 2026-07-27 — `is_portal_admin()`,
-- `is_portal_am()`, `is_sm()`, `is_member()`, as 34 policies que os usavam, e os corpos de
-- `enforce_cycle_transition`, `officialize_cycle`, `restart_assessment`, `delete_squad`,
-- `find_profile_by_email` e `can_sync_anchors` como estavam antes do RBAC.
--
-- ⚠️ ELE ABORTA SE O PAPEL `admin` NOVO ESTIVER EM USO. Ler o §0 antes de rodar: é uma
-- ESCALAÇÃO DE PRIVILÉGIO silenciosa, não um detalhe de conveniência.
--
-- ⚠️ O QUE ELE NÃO PODE RESTAURAR:
--   · As EDIÇÕES da matriz. Se alguém mexeu em papéis × funções pela tela, essa configuração
--     morre com a tabela — o modelo antigo não tem onde guardá-la. As policies voltam ao
--     comportamento de 27/07, que pode ser mais ou menos permissivo do que a matriz estava.
--     Se a configuração importar, exporte `neo_role_permissions` ANTES de rodar isto.
--   · A trilha de `neo_role_permissions_audit`. Ela é apagada junto. Exporte antes se a
--     auditoria de quem mudou o quê tiver de sobreviver ao rollback.
-- Em resumo: rollback de RBAC PERDE INFORMAÇÃO por construção. O backup exigido antes de
-- promover é o caminho de volta de verdade; este script é o caminho rápido.
-- ============================================================================

begin;

-- ────────────────────────────────────────────────────────────
-- 0. O FREIO — o papel `admin` novo não tem para onde voltar
--
-- Antes desta migration havia UM papel administrativo (`admin`, que fazia tudo). Depois há
-- dois: `admin_geral` (o antigo) e `admin` (operacional, que NÃO governa acesso).
--
-- Ao voltar, `admin_geral` retoma o nome `admin`. Quem tiver recebido o papel `admin` NOVO
-- passaria a ser, sem nenhum aviso, o admin todo-poderoso do modelo antigo — incluindo
-- conceder papéis, que é exatamente o poder que essa pessoa não deveria ter.
--
-- Abortar é a única saída honesta: quem reverte tem de decidir, pessoa por pessoa, se ela
-- vira admin pleno ou perde o acesso. A decisão é de gente, não de script.
-- ────────────────────────────────────────────────────────────
do $$
declare
  v_admins text;
begin
  select string_agg(email, ', ') into v_admins
    from public.portal_roles where role = 'admin' and revoked_at is null;

  if v_admins is not null then
    raise exception
      'ABORTADO: % têm o papel Admin (operacional), que não existe no modelo antigo. Voltar os tornaria admin PLENO, com poder de conceder papéis. Decida antes: promova a admin_geral quem deve ter esse poder e revogue o papel de quem não deve, depois rode este script. Pessoas: %',
      (select count(*) from public.portal_roles where role = 'admin' and revoked_at is null),
      v_admins;
  end if;
end $$;

-- ────────────────────────────────────────────────────────────
-- 0b. AS GUARDAS DO RBAC SAEM PRIMEIRO — e a ordem é load-bearing
--
-- `assert_admin_path_roles_trg` é AFTER STATEMENT em `portal_roles` e exige que alguém ativo
-- detenha `neo.roles.manage`. O §2 renomeia `admin_geral` de volta para `admin`: no instante
-- desse UPDATE ninguém mais detém `admin_geral`, logo ninguém detém a permissão, e a guarda
-- ABORTA O PRÓPRIO ROLLBACK.
--
-- Descoberto ao ENSAIAR o rollback no PGlite (tests/pg/rollback.ts), não ao revisá-lo. A
-- primeira escrita deste arquivo tinha os drops no fim, e o rollback era impossível de rodar.
-- ────────────────────────────────────────────────────────────

drop trigger if exists assert_admin_path_matrix_trg on public.neo_role_permissions;
drop trigger if exists assert_admin_path_roles_trg  on public.portal_roles;
drop trigger if exists audit_role_permission_trg    on public.neo_role_permissions;

-- ────────────────────────────────────────────────────────────
-- 1. As funções do modelo antigo, de volta
-- ────────────────────────────────────────────────────────────

create or replace function public.is_portal_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    exists (select 1 from public.portal_roles
             where role = 'admin' and revoked_at is null
               and email = lower(auth.jwt() ->> 'email')),
    false
  );
$$;

create or replace function public.is_portal_am() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    exists (select 1 from public.portal_roles
             where role = 'am' and revoked_at is null
               and email = lower(auth.jwt() ->> 'email')),
    false
  ) or public.is_portal_admin();
$$;

create or replace function public.is_member(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from squad_members where team_id = t and user_id = auth.uid());
$$;

create or replace function public.is_sm(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from squad_members
                 where team_id = t and user_id = auth.uid() and role = 'sm');
$$;

revoke all on function public.is_portal_admin() from public, anon;
revoke all on function public.is_portal_am() from public, anon;
revoke all on function public.is_member(uuid) from public, anon;
revoke all on function public.is_sm(uuid) from public, anon;
grant execute on function public.is_portal_admin() to authenticated;
grant execute on function public.is_portal_am() to authenticated;
grant execute on function public.is_member(uuid) to authenticated;
grant execute on function public.is_sm(uuid) to authenticated;

-- ────────────────────────────────────────────────────────────
-- 2. `admin_geral` volta a se chamar `admin`
--
-- ORDEM, pelo mesmo motivo da ida: a FK e o trigger de escopo saem primeiro, o
-- `protect_last_admin` volta a olhar 'admin' ANTES do update (senão ele lê o rename como
-- "removeram o último admin" e aborta), e só então o update.
-- ────────────────────────────────────────────────────────────

alter table public.portal_roles drop constraint if exists portal_roles_role_fkey;
drop trigger if exists validate_portal_role_scope_trg on public.portal_roles;
drop function if exists public.validate_portal_role_scope();

create or replace function public.protect_last_admin() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_restantes int;
begin
  if (tg_op = 'DELETE' and old.role = 'admin')
     or (tg_op = 'UPDATE' and old.role = 'admin' and new.role <> 'admin') then
    select count(*) into v_restantes
      from public.portal_roles
     where role = 'admin' and email <> old.email;
    if v_restantes = 0 then
      raise exception
        'não é possível remover o último admin do portal (%). Conceda admin a outra pessoa antes.',
        old.email;
    end if;
  end if;
  return coalesce(new, old);
end $$;

update public.portal_roles set role = 'admin_geral_pendente' where role = 'admin_geral';
update public.portal_roles set role = 'admin' where role = 'admin_geral_pendente';

alter table public.portal_roles
  add constraint portal_roles_role_check check (role in ('admin', 'am'));

-- ────────────────────────────────────────────────────────────
-- 3. As policies, como estavam em 27/07
-- ────────────────────────────────────────────────────────────

drop policy if exists teams_read on public.teams;
create policy teams_read on public.teams for select to authenticated
  using (is_member(id) or is_portal_am());

drop policy if exists sqm_read on public.squad_members;
create policy sqm_read on public.squad_members for select to authenticated
  using (user_id = auth.uid() or is_member(team_id) or is_portal_am());

drop policy if exists cycles_read on public.assessment_cycles;
create policy cycles_read on public.assessment_cycles for select to authenticated
  using (is_member(team_id) or is_portal_am());

drop policy if exists read_readings on public.anchor_readings;
create policy read_readings on public.anchor_readings for select to authenticated
  using (is_member(team_id) or is_portal_am());

drop policy if exists kz_read on public.kaizens;
create policy kz_read on public.kaizens for select to authenticated
  using (is_member(team_id) or is_portal_am());

drop policy if exists prop_read on public.proposals;
create policy prop_read on public.proposals for select to authenticated
  using (exists (select 1 from assessment_cycles c
                 where c.id = cycle_id and (is_member(c.team_id) or is_portal_am())));

drop policy if exists presession_read on public.pre_session_assessments;
create policy presession_read on public.pre_session_assessments for select to authenticated
  using (exists (select 1 from assessment_cycles c
                 where c.id = cycle_id and (is_member(c.team_id) or is_portal_am())));

drop policy if exists homolog_read on public.homologations;
create policy homolog_read on public.homologations for select to authenticated
  using (exists (select 1 from assessment_cycles c
                 where c.id = cycle_id and (is_member(c.team_id) or is_portal_am())));

drop policy if exists cycles_insert on public.assessment_cycles;
create policy cycles_insert on public.assessment_cycles for insert to authenticated
  with check (is_sm(team_id) or is_portal_am());

drop policy if exists cycles_update on public.assessment_cycles;
create policy cycles_update on public.assessment_cycles for update to authenticated
  using (is_sm(team_id) or is_portal_am())
  with check (status <> 'official');

drop policy if exists presession_write on public.pre_session_assessments;
create policy presession_write on public.pre_session_assessments for all to authenticated
  using (exists (select 1 from assessment_cycles c
                 where c.id = cycle_id and (is_sm(c.team_id) or is_portal_am())
                   and c.status = 'pre_session'))
  with check (exists (select 1 from assessment_cycles c
                 where c.id = cycle_id and (is_sm(c.team_id) or is_portal_am())
                   and c.status = 'pre_session'));

drop policy if exists prop_write on public.proposals;
create policy prop_write on public.proposals for all to authenticated
  using (exists (select 1 from assessment_cycles c
                 where c.id = cycle_id and (is_sm(c.team_id) or is_portal_am())
                   and c.status = 'session'))
  with check (exists (select 1 from assessment_cycles c
                 where c.id = cycle_id and (is_sm(c.team_id) or is_portal_am())
                   and c.status = 'session'));

drop policy if exists homolog_write on public.homologations;
create policy homolog_write on public.homologations for insert to authenticated
  with check (
    am_user_id = auth.uid() and is_portal_am()
    and exists (select 1 from assessment_cycles c
                where c.id = cycle_id and c.status = 'homologation')
  );

drop policy if exists homolog_update on public.homologations;
create policy homolog_update on public.homologations for update to authenticated
  using (is_portal_am() and exists (select 1 from assessment_cycles c
                 where c.id = cycle_id and c.status = 'homologation'))
  with check (is_portal_am() and exists (select 1 from assessment_cycles c
                 where c.id = cycle_id and c.status = 'homologation'));

drop policy if exists kz_insert on public.kaizens;
create policy kz_insert on public.kaizens for insert to authenticated
  with check (is_member(team_id) or is_portal_am());

drop policy if exists kz_update on public.kaizens;
create policy kz_update on public.kaizens for update to authenticated
  using (is_member(team_id) or is_portal_am())
  with check (is_member(team_id) or is_portal_am());

drop policy if exists kz_delete on public.kaizens;
create policy kz_delete on public.kaizens for delete to authenticated
  using (is_portal_admin());

drop policy if exists sqm_write on public.squad_members;
create policy sqm_write on public.squad_members for all to authenticated
  using (is_portal_admin()) with check (is_portal_admin());

drop policy if exists teams_insert on public.teams;
create policy teams_insert on public.teams for insert to authenticated
  with check (is_portal_admin());

drop policy if exists teams_write on public.teams;
create policy teams_write on public.teams for update to authenticated
  using (is_portal_admin()) with check (is_portal_admin());

drop policy if exists content_write_axes on public.axes;
create policy content_write_axes on public.axes for all to authenticated
  using (is_portal_admin()) with check (is_portal_admin());
drop policy if exists content_write_dims on public.dimensions;
create policy content_write_dims on public.dimensions for all to authenticated
  using (is_portal_admin()) with check (is_portal_admin());
drop policy if exists content_write_stages on public.stages;
create policy content_write_stages on public.stages for all to authenticated
  using (is_portal_admin()) with check (is_portal_admin());
drop policy if exists content_write_anchor on public.anchors;
create policy content_write_anchor on public.anchors for all to authenticated
  using (is_portal_admin()) with check (is_portal_admin());
drop policy if exists content_write_dsd on public.dimension_stage_descriptions;
create policy content_write_dsd on public.dimension_stage_descriptions for all to authenticated
  using (is_portal_admin()) with check (is_portal_admin());

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or is_portal_am() or shares_squad_with(id));

drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles for update to authenticated
  using (is_portal_admin()) with check (is_portal_admin());

drop policy if exists portal_roles_read on public.portal_roles;
create policy portal_roles_read on public.portal_roles for select to authenticated
  using (email = lower(auth.jwt() ->> 'email') or is_portal_admin());

drop policy if exists portal_roles_write on public.portal_roles;
create policy portal_roles_write on public.portal_roles for all to authenticated
  using (is_portal_admin()) with check (is_portal_admin());

drop policy if exists destructive_audit_read on public.destructive_audit;
create policy destructive_audit_read on public.destructive_audit for select to authenticated
  using (is_portal_am());

-- `neo_access` volta a NÃO ter escrita pela aplicação (era tarefa do dashboard do Supabase).
drop policy if exists neo_access_write on public.neo_access;
drop policy if exists neo_access_read on public.neo_access;
create policy "neo_access readable by allowed" on public.neo_access for select
  using (public.is_neo_allowed());

-- Tabelas legadas: escrita volta ao admin do portal.
do $$
declare v_table text;
begin
  foreach v_table in array array['themes','levels','questions','theme_level_descriptions',
                                'assessments','assessment_answers','assessment_theme_scores','custom_kaizens'] loop
    if to_regclass('public.' || v_table) is null then continue; end if;
    execute format('drop policy if exists legacy_write on public.%I', v_table);
    execute format('drop policy if exists legacy_read on public.%I', v_table);
    execute format(
      'create policy legacy_read on public.%I for select to authenticated using (true)', v_table);
    execute format(
      'create policy legacy_write on public.%I for all to authenticated '
      'using (is_portal_admin()) with check (is_portal_admin())', v_table);
  end loop;
end $$;

-- `user_roles`: as 4 policies originais dependiam de `is_admin(auth.uid())`, que lê a própria
-- tabela. Restaurar isto REABRE o caminho de autoridade que a ida fechou — está aqui porque
-- rollback é rollback, mas é um dos motivos para preferir o backup.
do $$
declare v_policy text;
begin
  if to_regclass('public.user_roles') is null then return; end if;
  for v_policy in select policyname from pg_policies
                   where schemaname='public' and tablename='user_roles' loop
    execute format('drop policy %I on public.user_roles', v_policy);
  end loop;
  create policy "Admins can view all roles" on public.user_roles for select to authenticated
    using (is_admin(auth.uid()));
  create policy "Users can view their own role" on public.user_roles for select to authenticated
    using (auth.uid() = user_id);
  create policy "Admins can insert roles" on public.user_roles for insert to authenticated
    with check (is_admin(auth.uid()));
  create policy "Admins can update roles" on public.user_roles for update to authenticated
    using (is_admin(auth.uid()));
  create policy "Admins can delete roles" on public.user_roles for delete to authenticated
    using (is_admin(auth.uid()));
end $$;

-- ────────────────────────────────────────────────────────────
-- 4. As funções de negócio, com os predicados antigos
-- ────────────────────────────────────────────────────────────

create or replace function public.enforce_cycle_transition() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.status = old.status then return new; end if;
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if is_portal_admin() then return new; end if;

  if old.status = 'pre_session' and new.status = 'session' then
    if not (is_sm(new.team_id) or is_portal_am()) then
      raise exception 'apenas o SM do squad ou um AM pode abrir a sessão';
    end if;
  elsif old.status = 'session' and new.status = 'homologation' then
    if not (is_sm(new.team_id) or is_portal_am()) then
      raise exception 'apenas o SM do squad ou um AM pode enviar para homologação';
    end if;
  elsif old.status = 'homologation' and new.status in ('session', 'official') then
    if not is_portal_am() then
      raise exception 'apenas um AM pode homologar ou devolver o pacote para a sessão';
    end if;
  elsif old.status = 'official' and new.status = 'archived' then
    if not is_portal_am() then
      raise exception 'apenas um AM pode arquivar o ciclo';
    end if;
  else
    raise exception 'transição de ciclo inválida: % → %', old.status, new.status;
  end if;
  return new;
end $$;

create or replace function public.can_sync_anchors(p_team uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.is_sm(p_team), false) or coalesce(public.is_portal_am(), false);
$$;

create or replace function public.delete_squad(p_team uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_portal_admin() then
    raise exception 'apenas o admin do portal pode excluir squads';
  end if;
  if not exists (select 1 from teams where id = p_team) then
    raise exception 'squad inexistente';
  end if;
  delete from anchor_readings where team_id = p_team;
  delete from kaizens where team_id = p_team;
  delete from assessment_cycles where team_id = p_team;
  delete from teams where id = p_team;
end $$;

create or replace function public.find_profile_by_email(p_email text)
returns table (id uuid, email text, full_name text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_portal_admin() then
    raise exception 'apenas o admin do portal pode buscar perfis por e-mail';
  end if;
  return query
    select p.id, p.email, p.full_name from profiles p
     where lower(p.email) = lower(trim(p_email)) limit 1;
end $$;

-- `officialize_cycle` e `restart_assessment`: só o predicado volta. Os corpos (geração de
-- kaizens, snapshot, motivo obrigatório) são idênticos aos da ida — reescrevê-los aqui de
-- memória é exatamente como a etapa "Plano" foi apagada por descuido em 26/07.
create or replace function public.officialize_cycle(p_cycle uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_team uuid; v_dims int; v_homs int;
begin
  select team_id into v_team from assessment_cycles where id = p_cycle;
  if v_team is null then raise exception 'ciclo inexistente'; end if;
  if not is_portal_am() then raise exception 'apenas um AM pode oficializar'; end if;

  select count(*) into v_dims from dimensions;
  select count(*) into v_homs from homologations where cycle_id = p_cycle;
  if v_homs < v_dims then
    raise exception 'homologação incompleta: % de % dimensões', v_homs, v_dims;
  end if;

  update assessment_cycles
     set status = 'official', officialized_at = now(), homologated_by = auth.uid()
   where id = p_cycle and status = 'homologation';
  if not found then raise exception 'ciclo não está em homologação'; end if;

  insert into kaizens (team_id, cycle_id, dimension_id, title, from_stage, to_stage, anchor_id, source)
  select v_team, p_cycle, h.dimension_id,
         coalesce(dsd.kaizen_hint, 'Definir kaizen para ' || d.name),
         floor(h.official_stage)::int,
         least(floor(h.official_stage)::int + 1, 4),
         (select a.id from anchors a where a.dimension_id = h.dimension_id and a.active limit 1),
         'model'
  from homologations h
  join dimensions d on d.id = h.dimension_id
  left join dimension_stage_descriptions dsd
    on dsd.dimension_id = h.dimension_id and dsd.stage_number = floor(h.official_stage)::int
  where h.cycle_id = p_cycle and floor(h.official_stage) < 4;
end $$;

create or replace function public.restart_assessment(p_team uuid, p_reason text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_cycle uuid; v_snapshot jsonb;
begin
  if not is_portal_admin() then
    raise exception 'apenas o admin do portal pode reiniciar assessments';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'informe o motivo do reinício (p_reason) — a ação é destrutiva e auditada';
  end if;

  select id into v_cycle from assessment_cycles
   where team_id = p_team order by quarter desc, created_at desc limit 1 for update;
  if v_cycle is null then raise exception 'nenhum assessment encontrado para este squad'; end if;

  select jsonb_build_object(
           'cycle',        (select to_jsonb(c) from assessment_cycles c where c.id = v_cycle),
           'proposals',    coalesce((select jsonb_agg(to_jsonb(p)) from proposals p where p.cycle_id = v_cycle), '[]'::jsonb),
           'homologations',coalesce((select jsonb_agg(to_jsonb(h)) from homologations h where h.cycle_id = v_cycle), '[]'::jsonb),
           'kaizens',      coalesce((select jsonb_agg(to_jsonb(k)) from kaizens k where k.cycle_id = v_cycle), '[]'::jsonb),
           'pre_session',  coalesce((select jsonb_agg(to_jsonb(s)) from pre_session_assessments s where s.cycle_id = v_cycle), '[]'::jsonb)
         ) into v_snapshot;

  insert into public.destructive_audit (action, team_id, cycle_id, actor_email, actor_id, reason, snapshot)
  values ('restart_assessment', p_team, v_cycle,
          lower(auth.jwt() ->> 'email'), auth.uid(), btrim(p_reason), v_snapshot);

  delete from kaizens where cycle_id = v_cycle;
  delete from homologations where cycle_id = v_cycle;
  delete from proposals where cycle_id = v_cycle;
  delete from pre_session_assessments where cycle_id = v_cycle;

  update assessment_cycles
     set status = 'pre_session', workshop_at = null,
         officialized_at = null, homologated_by = null
   where id = v_cycle;
  return v_cycle;
end $$;

-- ────────────────────────────────────────────────────────────
-- 5. O RBAC sai
--
-- Por último, e nesta ordem: os triggers antes das funções que eles executam, e as tabelas
-- depois de nada mais depender delas.
-- ────────────────────────────────────────────────────────────

-- Os triggers já saíram no §0b (a ordem é obrigatória); aqui saem as funções que eles
-- executavam, agora que nada mais as referencia.
drop function if exists public.assert_admin_path_reachable();
drop function if exists public.audit_role_permission();

-- ⚠️ AS TABELAS ANTES DAS FUNÇÕES. As policies das próprias tabelas do RBAC
-- (`neo_role_permissions_write` e `neo_role_permissions_audit_read`) chamam `has_perm`, e o
-- Postgres RECUSA `drop function` enquanto uma policy depender dela — dropar a tabela é o que
-- leva a policy embora. A primeira escrita deste arquivo tinha a ordem invertida e morria em
-- "cannot drop function has_perm(text,uuid) because other objects depend on it"; quem pegou
-- foi tests/pg/rollback.ts.
drop index if exists public.portal_roles_email_ativo_idx;
drop index if exists public.squad_members_user_team_idx;
drop index if exists public.neo_role_permissions_perm_idx;

drop table if exists public.neo_role_permissions_audit;
-- A matriz-padrão tem FK para `neo_roles`/`neo_permissions`, então sai antes delas.
drop table if exists public.neo_role_permissions_default;
drop table if exists public.neo_role_permissions;
drop table if exists public.neo_permissions;
drop table if exists public.neo_roles;

drop function if exists public.my_squad_permissions(uuid);
drop function if exists public.my_neo_claims();
drop function if exists public.my_permissions();
drop function if exists public.has_perm_prefix(text, uuid);
drop function if exists public.has_perm(text, uuid);

commit;
