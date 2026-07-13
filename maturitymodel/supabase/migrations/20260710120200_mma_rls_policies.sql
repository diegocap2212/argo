-- ============================================================================
-- 003_rls_policies.sql · Segurança e regras de negócio no banco
-- Princípios:
--   1. Conteúdo do modelo: leitura para qualquer autenticado; escrita só AM.
--   2. Dados de squad: visíveis a membros do squad e a AMs.
--   3. Voto é sigiloso até o ciclo sair de 'voting' (revelação garantida no banco).
--   4. Oficialização só via RPC transacional (nunca update direto de status).
-- ============================================================================

-- ────────────────────────────────────────────────────────────
-- Funções de autorização (security definer p/ não recursionar RLS)
-- ────────────────────────────────────────────────────────────

create or replace function is_member(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from squad_members where team_id = t and user_id = auth.uid());
$$;

create or replace function is_am(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from squad_members
                 where team_id = t and user_id = auth.uid() and role = 'am');
$$;

create or replace function is_sm(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from squad_members
                 where team_id = t and user_id = auth.uid() and role = 'sm');
$$;

create or replace function is_any_am() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from squad_members where user_id = auth.uid() and role = 'am');
$$;

-- ────────────────────────────────────────────────────────────
-- Conteúdo do modelo
-- ────────────────────────────────────────────────────────────

alter table axes enable row level security;
alter table stages enable row level security;
alter table dimensions enable row level security;
alter table dimension_stage_descriptions enable row level security;
alter table anchors enable row level security;

create policy content_read_axes   on axes   for select to authenticated using (true);
create policy content_read_stages on stages for select to authenticated using (true);
create policy content_read_dims   on dimensions for select to authenticated using (true);
create policy content_read_dsd    on dimension_stage_descriptions for select to authenticated using (true);
create policy content_read_anchor on anchors for select to authenticated using (true);

create policy content_write_axes   on axes   for all to authenticated using (is_any_am()) with check (is_any_am());
create policy content_write_stages on stages for all to authenticated using (is_any_am()) with check (is_any_am());
create policy content_write_dims   on dimensions for all to authenticated using (is_any_am()) with check (is_any_am());
create policy content_write_dsd    on dimension_stage_descriptions for all to authenticated using (is_any_am()) with check (is_any_am());
create policy content_write_anchor on anchors for all to authenticated using (is_any_am()) with check (is_any_am());

-- ────────────────────────────────────────────────────────────
-- Organização
-- ────────────────────────────────────────────────────────────

alter table squad_members enable row level security;

create policy sqm_read on squad_members for select to authenticated
  using (user_id = auth.uid() or is_member(team_id) or is_any_am());
create policy sqm_write on squad_members for all to authenticated
  using (is_any_am()) with check (is_any_am());

-- teams: leitura para membros e AMs; escrita AM.
alter table teams enable row level security;
drop policy if exists teams_read on teams;
create policy teams_read on teams for select to authenticated
  using (is_member(id) or is_any_am());
create policy teams_write on teams for update to authenticated
  using (is_any_am()) with check (is_any_am());

-- ────────────────────────────────────────────────────────────
-- Ciclos
-- ────────────────────────────────────────────────────────────

alter table assessment_cycles enable row level security;

create policy cycles_read on assessment_cycles for select to authenticated
  using (is_member(team_id) or is_any_am());
create policy cycles_insert on assessment_cycles for insert to authenticated
  with check (is_sm(team_id) or is_am(team_id));
-- transições de status permitidas por update direto: voting→workshop→proposed→homologation
-- (official APENAS via RPC officialize_cycle)
create policy cycles_update on assessment_cycles for update to authenticated
  using (is_sm(team_id) or is_am(team_id))
  with check (status <> 'official');

-- ────────────────────────────────────────────────────────────
-- Votos · sigilo até a revelação
-- ────────────────────────────────────────────────────────────

alter table votes enable row level security;

create policy votes_insert on votes for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from assessment_cycles c
                where c.id = cycle_id and c.status = 'voting' and is_member(c.team_id))
  );

create policy votes_update_own on votes for update to authenticated
  using (user_id = auth.uid()
    and exists (select 1 from assessment_cycles c
                where c.id = cycle_id and c.status = 'voting'))
  with check (user_id = auth.uid());

create policy votes_select_own on votes for select to authenticated
  using (user_id = auth.uid());

create policy votes_select_revealed on votes for select to authenticated
  using (exists (select 1 from assessment_cycles c
                 where c.id = cycle_id
                   and c.status <> 'voting'
                   and (is_member(c.team_id) or is_any_am())));

-- ────────────────────────────────────────────────────────────
-- Propostas (fechadas no workshop pelo SM)
-- ────────────────────────────────────────────────────────────

alter table proposals enable row level security;

create policy prop_read on proposals for select to authenticated
  using (exists (select 1 from assessment_cycles c
                 where c.id = cycle_id and (is_member(c.team_id) or is_any_am())));
create policy prop_write on proposals for all to authenticated
  using (exists (select 1 from assessment_cycles c
                 where c.id = cycle_id and is_sm(c.team_id)
                   and c.status in ('workshop','proposed')))
  with check (exists (select 1 from assessment_cycles c
                 where c.id = cycle_id and is_sm(c.team_id)
                   and c.status in ('workshop','proposed')));

-- ────────────────────────────────────────────────────────────
-- Homologações (AM)
-- ────────────────────────────────────────────────────────────

alter table homologations enable row level security;

create policy homolog_read on homologations for select to authenticated
  using (exists (select 1 from assessment_cycles c
                 where c.id = cycle_id and (is_member(c.team_id) or is_any_am())));

create policy homolog_write on homologations for insert to authenticated
  with check (
    am_user_id = auth.uid()
    and exists (select 1 from assessment_cycles c
                where c.id = cycle_id and is_am(c.team_id)
                  and c.status in ('proposed','homologation'))
  );

create policy homolog_update on homologations for update to authenticated
  using (am_user_id = auth.uid()
    and exists (select 1 from assessment_cycles c
                where c.id = cycle_id and c.status in ('proposed','homologation')))
  with check (am_user_id = auth.uid());

-- ────────────────────────────────────────────────────────────
-- Âncoras (leituras) e Kaizens
-- ────────────────────────────────────────────────────────────

alter table anchor_readings enable row level security;

create policy read_readings on anchor_readings for select to authenticated
  using (is_member(team_id) or is_any_am());
-- escrita de anchor_readings: apenas service_role (Edge Function). Sem policy de
-- insert para authenticated = negado por padrão; service_role bypassa RLS.

alter table kaizens enable row level security;

create policy kz_read on kaizens for select to authenticated
  using (is_member(team_id) or is_any_am());
create policy kz_write on kaizens for all to authenticated
  using (is_member(team_id) or is_any_am())
  with check (is_member(team_id) or is_any_am());

-- ────────────────────────────────────────────────────────────
-- RPC · oficialização transacional
-- ────────────────────────────────────────────────────────────

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

  -- gera kaizens sugeridos a partir do estágio oficializado (kaizen do estágio atual,
  -- que descreve o passo para o próximo)
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

revoke all on function officialize_cycle(uuid) from public;
grant execute on function officialize_cycle(uuid) to authenticated;
