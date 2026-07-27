-- ============================================================================
-- ROLLBACK de 20260726120000_portal_roles.sql
--
-- NÃO ESTÁ EM supabase/migrations DE PROPÓSITO: se estivesse, o `db push` a
-- aplicaria em sequência e desfaria a migration no mesmo deploy. Rodar À MÃO,
-- e só se for preciso reverter.
--
-- O QUE ESTE SCRIPT RESTAURA: o modelo de papéis de 2026-07-15 (portal_admins por
-- e-mail + AM por squad), as policies que dependiam de `is_am(uuid)`, o
-- `officialize_cycle` do AM do squad e o `restart_assessment` que voltava para 'session'.
--
-- ⚠️ O QUE ELE NÃO PODE RESTAURAR: a distinção original entre 'po', 'tl' e 'team'.
-- A migration de ida colapsou os três em 'member' com um UPDATE, e nada guarda qual
-- era qual. Este rollback devolve o CHECK permissivo, então nada quebra, mas todos
-- seguem 'member'. Se essa distinção importar, restaure de um BACKUP em vez de rodar
-- este script — era exatamente o objetivo do backup exigido antes de promover.
-- Na prática os três papéis não tinham consequência funcional (o voto individual morreu
-- na sessão colaborativa), e é por isso que a ida foi considerada segura.
-- ============================================================================

begin;

-- ── 1. Estrutura antiga ──
create table if not exists public.portal_admins (
  email text primary key check (email = lower(email)),
  note  text,
  created_at timestamptz not null default now()
);
alter table public.portal_admins enable row level security;

insert into public.portal_admins (email, note)
  select email, note from public.portal_roles where role = 'admin'
on conflict (email) do nothing;

create or replace function public.is_portal_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    exists (select 1 from public.portal_admins
            where email = lower(auth.jwt() ->> 'email')),
    false
  );
$$;

-- ── 2. is_am(uuid) volta ANTES das policies que o usam ──
create or replace function is_am(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from squad_members
                  where team_id = t and user_id = auth.uid() and role = 'am');
$$;

grant execute on function is_am(uuid) to authenticated;

-- ── 3. CHECK permissivo antes de reinserir papéis de squad ──
alter table squad_members drop constraint if exists squad_members_role_check;
alter table squad_members
  add constraint squad_members_role_check check (role in ('team','po','tl','sm','am'));

-- Quem tinha AM global e é membro de um squad volta a ser AM NAQUELE squad.
-- Quem tinha AM global sem ser membro de nenhum squad PERDE o poder — não há para
-- onde devolvê-lo no modelo por squad. É a assimetria inerente de voltar atrás.
update squad_members sm
   set role = 'am'
  from profiles p, public.portal_roles pr
 where p.id = sm.user_id
   and pr.role = 'am'
   and pr.email = lower(p.email);

-- ── 4. Trigger da jornada sai (o modelo antigo não tinha guarda no banco) ──
drop trigger if exists cycle_transition_guard on assessment_cycles;
drop function if exists public.enforce_cycle_transition();

-- ── 5. Policies de volta ao predicado por squad ──
drop policy if exists teams_read on teams;
create policy teams_read on teams for select to authenticated
  using (is_member(id) or is_portal_admin());

drop policy if exists sqm_read on squad_members;
create policy sqm_read on squad_members for select to authenticated
  using (user_id = auth.uid() or is_member(team_id) or is_portal_admin());

drop policy if exists cycles_read on assessment_cycles;
create policy cycles_read on assessment_cycles for select to authenticated
  using (is_member(team_id) or is_portal_admin());

drop policy if exists prop_read on proposals;
create policy prop_read on proposals for select to authenticated
  using (exists (select 1 from assessment_cycles c
                 where c.id = cycle_id and (is_member(c.team_id) or is_portal_admin())));

drop policy if exists presession_read on pre_session_assessments;
create policy presession_read on pre_session_assessments for select to authenticated
  using (exists (select 1 from assessment_cycles c
                 where c.id = cycle_id and (is_member(c.team_id) or is_portal_admin())));

drop policy if exists homolog_read on homologations;
create policy homolog_read on homologations for select to authenticated
  using (exists (select 1 from assessment_cycles c
                 where c.id = cycle_id and (is_member(c.team_id) or is_portal_admin())));

drop policy if exists read_readings on anchor_readings;
create policy read_readings on anchor_readings for select to authenticated
  using (is_member(team_id) or is_portal_admin());

drop policy if exists kz_read on kaizens;
create policy kz_read on kaizens for select to authenticated
  using (is_member(team_id) or is_portal_admin());

drop policy if exists kz_write on kaizens;
create policy kz_write on kaizens for all to authenticated
  using (is_member(team_id) or is_portal_admin())
  with check (is_member(team_id) or is_portal_admin());

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or is_portal_admin() or shares_squad_with(id));

-- ⚠️ O VAZAMENTO DE DIRETÓRIO **NÃO** É RESTAURADO, DE PROPÓSITO.
-- A migration de ida derrubou a policy legada `"Authenticated users can view all profiles"`
-- (`auth.uid() is not null`), que somava com OR e deixava qualquer autenticado ler o e-mail
-- e o nome de todas as pessoas. Recriá-la aqui seria reintroduzir uma falha de privacidade
-- para "voltar ao estado anterior" — o estado anterior estava errado.
-- Mesma coisa para `"Admins can update any profile"`, que dependia da tabela legada
-- `user_roles`: a versão via is_portal_admin() abaixo fica.
drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles for update to authenticated
  using (is_portal_admin()) with check (is_portal_admin());

drop policy if exists cycles_insert on assessment_cycles;
create policy cycles_insert on assessment_cycles for insert to authenticated
  with check (is_sm(team_id) or is_am(team_id));

drop policy if exists cycles_update on assessment_cycles;
create policy cycles_update on assessment_cycles for update to authenticated
  using (is_sm(team_id) or is_am(team_id))
  with check (status <> 'official');

drop policy if exists prop_write on proposals;
create policy prop_write on proposals for all to authenticated
  using (exists (select 1 from assessment_cycles c
                 where c.id = cycle_id
                   and (is_sm(c.team_id) or is_am(c.team_id))
                   and c.status = 'session'))
  with check (exists (select 1 from assessment_cycles c
                 where c.id = cycle_id
                   and (is_sm(c.team_id) or is_am(c.team_id))
                   and c.status = 'session'));

drop policy if exists presession_write on pre_session_assessments;
create policy presession_write on pre_session_assessments for all to authenticated
  using (exists (select 1 from assessment_cycles c
                 where c.id = cycle_id
                   and (is_sm(c.team_id) or is_am(c.team_id))
                   and c.status = 'pre_session'))
  with check (exists (select 1 from assessment_cycles c
                 where c.id = cycle_id
                   and (is_sm(c.team_id) or is_am(c.team_id))
                   and c.status = 'pre_session'));

drop policy if exists homolog_write on homologations;
create policy homolog_write on homologations for insert to authenticated
  with check (
    am_user_id = auth.uid()
    and exists (select 1 from assessment_cycles c
                where c.id = cycle_id and is_am(c.team_id)
                  and c.status = 'homologation')
  );

-- Inclui o fix de escalação SM→AM de 20260715150000 — reverter sem ele reabriria
-- o vetor de privilégio corrigido naquele dia.
drop policy if exists sqm_write on squad_members;
create policy sqm_write on squad_members for all to authenticated
  using (is_portal_admin() or is_am(team_id) or is_sm(team_id))
  with check (
    (is_portal_admin() or is_am(team_id) or is_sm(team_id))
    and (role <> 'am' or is_portal_admin() or is_am(team_id))
  );

drop policy if exists teams_write on teams;
create policy teams_write on teams for update to authenticated
  using (is_portal_admin() or is_am(id) or is_sm(id))
  with check (is_portal_admin() or is_am(id) or is_sm(id));

-- ── 6. RPCs ──
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

create or replace function officialize_cycle(p_cycle uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_team uuid;
  v_dims int;
  v_homs int;
begin
  select team_id into v_team from assessment_cycles where id = p_cycle;
  if v_team is null then raise exception 'ciclo inexistente'; end if;
  if not is_am(v_team) then raise exception 'apenas o AM do squad pode oficializar'; end if;

  select count(*) into v_dims from dimensions;
  select count(*) into v_homs from homologations where cycle_id = p_cycle;
  if v_homs < v_dims then
    raise exception 'homologação incompleta: % de % dimensões', v_homs, v_dims;
  end if;

  update assessment_cycles
     set status = 'official', officialized_at = now(), homologated_by = auth.uid()
   where id = p_cycle;

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
    on dsd.dimension_id = h.dimension_id
   and dsd.stage_number = floor(h.official_stage)::int
  where h.cycle_id = p_cycle
    and floor(h.official_stage) < 4;
end $$;

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

  delete from kaizens       where cycle_id = v_cycle;
  delete from homologations where cycle_id = v_cycle;
  delete from proposals     where cycle_id = v_cycle;

  update assessment_cycles
     set status = 'session',
         workshop_at = now(),
         officialized_at = null,
         homologated_by = null
   where id = v_cycle;

  return v_cycle;
end $$;

-- ── 7. Estrutura nova sai por último ──
drop function if exists public.my_portal_roles();
drop function if exists public.is_portal_am();
drop table if exists public.portal_roles;

commit;

-- APÓS RODAR: reverter também o código do app (o front chama my_portal_roles() e lê
-- portal_roles). Rollback de banco sozinho deixa a home sem papel e fail-closed —
-- ninguém vê nada além dos próprios squads.
