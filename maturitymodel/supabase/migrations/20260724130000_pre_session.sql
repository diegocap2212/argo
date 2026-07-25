-- Pré-sessão do SM: novo estado + tabela + RLS (freeze via status).
begin;

-- 1. Aceitar 'pre_session' no CHECK de status e torná-lo o default (ciclo nasce nele).
alter table assessment_cycles drop constraint assessment_cycles_status_check;
alter table assessment_cycles
  add constraint assessment_cycles_status_check
  check (status in ('pre_session','session','homologation','official','archived'));
alter table assessment_cycles alter column status set default 'pre_session';

-- 2. Artefato da pré-sessão (espelha proposals: 1 linha por dimensão do ciclo).
create table if not exists pre_session_assessments (
  cycle_id     uuid not null references assessment_cycles(id) on delete cascade,
  dimension_id uuid not null references dimensions(id),
  sm_stage     int  not null check (sm_stage between 1 and 4),
  rationale    text not null,
  created_by   uuid references auth.users(id),
  updated_at   timestamptz not null default now(),
  primary key (cycle_id, dimension_id)
);

alter table pre_session_assessments enable row level security;

-- 3. RLS espelhando proposals. Leitura: membro do squad ou portal admin.
create policy presession_read on pre_session_assessments for select to authenticated
  using (exists (select 1 from assessment_cycles c
                 where c.id = cycle_id and (is_member(c.team_id) or is_portal_admin())));

-- Escrita: SM/AM do squad, e SÓ enquanto o ciclo está em pre_session (freeze).
create policy presession_write on pre_session_assessments for all to authenticated
  using (exists (select 1 from assessment_cycles c
                 where c.id = cycle_id
                   and (is_sm(c.team_id) or is_am(c.team_id))
                   and c.status = 'pre_session'))
  with check (exists (select 1 from assessment_cycles c
                 where c.id = cycle_id
                   and (is_sm(c.team_id) or is_am(c.team_id))
                   and c.status = 'pre_session'));

commit;
