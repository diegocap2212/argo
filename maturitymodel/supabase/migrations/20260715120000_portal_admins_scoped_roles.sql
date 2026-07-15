-- ============================================================================
-- Redesenho de papéis (docs/ROLES-REDESIGN.md) — decisões do Diego 2026-07-15:
--   · Admin global explícito por E-MAIL de login: Diego Caporusso + Tiago Massaro (backup).
--   · SM/AM enxergam e gerenciam SÓ os próprios squads (membros + metadados do squad).
--   · Reiniciar avaliação e excluir squad: SÓ admin global.
--   · Diretório de pessoas fechado: admin vê tudo; demais veem colegas de squad;
--     gestores adicionam membros buscando por e-mail exato via RPC.
--   · Views v_* passam a security_invoker (antes bypassavam a RLS das tabelas base).
-- Remove todos os usos de is_any_am() (poder global de qualquer AM) e as policies
-- legadas de teams (owner/is_public/is_admin).
-- ============================================================================

-- ────────────────────────────────────────────────────────────
-- 1. Admin global por e-mail (padrão do is_neo_allowed: e-mail do JWT)
-- ────────────────────────────────────────────────────────────

create table if not exists public.portal_admins (
  email text primary key check (email = lower(email)),
  note  text,
  created_at timestamptz not null default now()
);

comment on table public.portal_admins is
  'Admins globais do Portal MMA, vinculados pelo e-mail de login (JWT). Gerenciado por migration/dashboard.';

alter table public.portal_admins enable row level security;
-- Sem policies para authenticated: ninguém lê/escreve via client; is_portal_admin()
-- (security definer) lê por baixo da RLS.

insert into public.portal_admins (email, note) values
  ('ext.diego.caporusso@lmmobilidade.com.br', 'Diego Caporusso — admin principal'),
  ('ext.tiago.massaro@lmmobilidade.com.br',   'Tiago Massaro — admin de backup')
on conflict (email) do nothing;

create or replace function public.is_portal_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    exists (select 1 from public.portal_admins
            where email = lower(auth.jwt() ->> 'email')),
    false
  );
$$;

grant execute on function public.is_portal_admin() to authenticated;

-- ────────────────────────────────────────────────────────────
-- 2. Conteúdo do modelo: escrita só admin (leitura segue aberta p/ o Guia)
-- ────────────────────────────────────────────────────────────

drop policy if exists content_write_axes   on axes;
drop policy if exists content_write_stages on stages;
drop policy if exists content_write_dims   on dimensions;
drop policy if exists content_write_dsd    on dimension_stage_descriptions;
drop policy if exists content_write_anchor on anchors;

create policy content_write_axes   on axes   for all to authenticated using (is_portal_admin()) with check (is_portal_admin());
create policy content_write_stages on stages for all to authenticated using (is_portal_admin()) with check (is_portal_admin());
create policy content_write_dims   on dimensions for all to authenticated using (is_portal_admin()) with check (is_portal_admin());
create policy content_write_dsd    on dimension_stage_descriptions for all to authenticated using (is_portal_admin()) with check (is_portal_admin());
create policy content_write_anchor on anchors for all to authenticated using (is_portal_admin()) with check (is_portal_admin());

-- ────────────────────────────────────────────────────────────
-- 3. squad_members: gestor (SM/AM) gerencia o PRÓPRIO squad; admin gerencia tudo
-- ────────────────────────────────────────────────────────────

drop policy if exists sqm_read  on squad_members;
drop policy if exists sqm_write on squad_members;

create policy sqm_read on squad_members for select to authenticated
  using (user_id = auth.uid() or is_member(team_id) or is_portal_admin());
create policy sqm_write on squad_members for all to authenticated
  using (is_portal_admin() or is_am(team_id) or is_sm(team_id))
  with check (is_portal_admin() or is_am(team_id) or is_sm(team_id));

-- ────────────────────────────────────────────────────────────
-- 4. teams: leitura por membro/admin; SM/AM editam METADADOS do próprio squad;
--    criação/exclusão só admin. Derruba as policies legadas (owner/public/admin).
-- ────────────────────────────────────────────────────────────

drop policy if exists "Owners and admins can view teams"            on public.teams;
drop policy if exists "Approved users can create their own teams"   on public.teams;
drop policy if exists "Owners and admins can update teams"          on public.teams;
drop policy if exists "Owners and admins can delete teams"          on public.teams;
drop policy if exists "Users can view their own teams or public teams" on public.teams;

drop policy if exists teams_read  on teams;
drop policy if exists teams_write on teams;

create policy teams_read on teams for select to authenticated
  using (is_member(id) or is_portal_admin());
create policy teams_write on teams for update to authenticated
  using (is_portal_admin() or is_am(id) or is_sm(id))
  with check (is_portal_admin() or is_am(id) or is_sm(id));
create policy teams_insert on teams for insert to authenticated
  with check (is_portal_admin());
-- DELETE direto: sem policy (negado). Exclusão só pelo RPC delete_squad (admin).

-- ────────────────────────────────────────────────────────────
-- 5. Leituras cross-squad: is_any_am() → is_portal_admin()
-- ────────────────────────────────────────────────────────────

drop policy if exists cycles_read on assessment_cycles;
create policy cycles_read on assessment_cycles for select to authenticated
  using (is_member(team_id) or is_portal_admin());

drop policy if exists prop_read on proposals;
create policy prop_read on proposals for select to authenticated
  using (exists (select 1 from assessment_cycles c
                 where c.id = cycle_id and (is_member(c.team_id) or is_portal_admin())));

drop policy if exists homolog_read on homologations;
create policy homolog_read on homologations for select to authenticated
  using (exists (select 1 from assessment_cycles c
                 where c.id = cycle_id and (is_member(c.team_id) or is_portal_admin())));

drop policy if exists read_readings on anchor_readings;
create policy read_readings on anchor_readings for select to authenticated
  using (is_member(team_id) or is_portal_admin());

drop policy if exists kz_read  on kaizens;
drop policy if exists kz_write on kaizens;
create policy kz_read on kaizens for select to authenticated
  using (is_member(team_id) or is_portal_admin());
create policy kz_write on kaizens for all to authenticated
  using (is_member(team_id) or is_portal_admin())
  with check (is_member(team_id) or is_portal_admin());

-- ────────────────────────────────────────────────────────────
-- 6. Diretório de pessoas fechado
-- ────────────────────────────────────────────────────────────

create or replace function public.shares_squad_with(target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from squad_members mine
      join squad_members theirs on theirs.team_id = mine.team_id
     where mine.user_id = auth.uid()
       and theirs.user_id = target
  );
$$;

grant execute on function public.shares_squad_with(uuid) to authenticated;

drop policy if exists "Users can view all profiles" on public.profiles;
drop policy if exists profiles_read on public.profiles;

create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or is_portal_admin() or shares_squad_with(id));

-- Gestor (SM/AM de algum squad) ou admin localiza um perfil por e-mail EXATO para
-- adicionar ao squad — sem enxergar o diretório inteiro.
create or replace function public.find_profile_by_email(p_email text)
returns table (id uuid, email text, full_name text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (
    is_portal_admin()
    or exists (select 1 from squad_members
               where user_id = auth.uid() and role in ('sm','am'))
  ) then
    raise exception 'apenas gestores (SM/AM) ou admins podem buscar perfis';
  end if;

  return query
    select p.id, p.email, p.full_name
      from profiles p
     where lower(p.email) = lower(trim(p_email))
     limit 1;
end $$;

revoke all on function public.find_profile_by_email(text) from public;
grant execute on function public.find_profile_by_email(text) to authenticated;

-- ────────────────────────────────────────────────────────────
-- 7. RPCs destrutivos: SÓ admin global
-- ────────────────────────────────────────────────────────────

create or replace function restart_assessment(p_team uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_cycle uuid;
begin
  if not is_portal_admin() then
    raise exception 'apenas o admin do portal pode reiniciar assessments';
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

  delete from kaizens where cycle_id = v_cycle;
  delete from homologations where cycle_id = v_cycle;
  delete from proposals where cycle_id = v_cycle;
  delete from votes where cycle_id = v_cycle;

  update assessment_cycles
     set status = 'session',
         workshop_at = now(),
         officialized_at = null,
         homologated_by = null
   where id = v_cycle;

  return v_cycle;
end $$;

create or replace function delete_squad(p_team uuid) returns void
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

-- officialize_cycle permanece is_am(team): homologar/oficializar é papel do AM do squad.

-- ────────────────────────────────────────────────────────────
-- 8. Views: security_invoker (antes rodavam como owner e BYPASSAVAM a RLS)
-- ────────────────────────────────────────────────────────────

alter view v_cycle_scores       set (security_invoker = true);
alter view v_quarter_comparison set (security_invoker = true);
alter view v_axis_scores        set (security_invoker = true);
