-- ============================================================================
-- 001_schema.sql · Portal MMA · Estrutura completa
-- Aditiva: não toca no schema legado (themes, levels, assessments etc.)
-- Requer: Postgres 15+ (Supabase), extensão pgcrypto (gen_random_uuid, default no Supabase)
-- ============================================================================

-- ────────────────────────────────────────────────────────────
-- 1. CONTEÚDO DO MODELO (referência)
-- ────────────────────────────────────────────────────────────

create table if not exists axes (
  id            uuid primary key default gen_random_uuid(),
  key           text unique not null,
  name          text not null,
  owner_role    text not null check (owner_role in ('sm','po','all')),
  display_order int not null
);

create table if not exists stages (
  number        int primary key check (number between 1 and 4),
  name          text not null,
  legacy_name   text not null,
  tuckman       text not null,
  description   text not null
);

create table if not exists dimensions (
  id            uuid primary key default gen_random_uuid(),
  axis_id       uuid not null references axes(id),
  key           text unique not null,
  name          text not null,
  description   text not null,
  narrative     text,
  owner_roles   text[] not null default '{}',
  display_order int not null
);

create table if not exists dimension_stage_descriptions (
  id            uuid primary key default gen_random_uuid(),
  dimension_id  uuid not null references dimensions(id) on delete cascade,
  stage_number  int  not null references stages(number),
  description   text not null,
  short_text    text not null,
  example       text,
  kaizen_hint   text,
  anchor_note   text,
  unique (dimension_id, stage_number)
);

create table if not exists anchors (
  id            uuid primary key default gen_random_uuid(),
  dimension_id  uuid not null references dimensions(id),
  name          text not null,
  metric_key    text not null,
  unit          text,
  comparator    text not null check (comparator in ('<=','>=','between')),
  stage_targets jsonb not null default '{}'::jsonb,
  active        boolean not null default true,
  unique (dimension_id, metric_key)
);

-- ────────────────────────────────────────────────────────────
-- 2. ORGANIZAÇÃO
-- ────────────────────────────────────────────────────────────
-- profiles e teams já existem no projeto; apenas evoluções aditivas:

alter table profiles add column if not exists full_name text;

alter table teams
  add column if not exists tower text default 'LM',
  add column if not exists locavia_team_key text,
  add column if not exists status text default 'active'
    check (status in ('active','forming','faseout'));

create table if not exists squad_members (
  team_id   uuid not null references teams(id) on delete cascade,
  user_id   uuid not null references profiles(id) on delete cascade,
  role      text not null check (role in ('team','po','tl','sm','am')),
  primary key (team_id, user_id, role)
);

create index if not exists idx_squad_members_user on squad_members(user_id);

-- ────────────────────────────────────────────────────────────
-- 3. CICLO DE ASSESSMENT (1 por quarter)
-- ────────────────────────────────────────────────────────────

create table if not exists assessment_cycles (
  id                uuid primary key default gen_random_uuid(),
  team_id           uuid not null references teams(id),
  quarter           text not null,                    -- '2026Q3'
  status            text not null default 'voting'
    check (status in ('voting','workshop','proposed','homologation','official','archived')),
  workshop_at       date,
  officialized_at   timestamptz,
  homologated_by    uuid references profiles(id),
  previous_cycle_id uuid references assessment_cycles(id),
  migrated_scale    boolean not null default false,
  created_at        timestamptz not null default now(),
  unique (team_id, quarter)
);

create index if not exists idx_cycles_team on assessment_cycles(team_id, quarter);

create table if not exists votes (
  id            uuid primary key default gen_random_uuid(),
  cycle_id      uuid not null references assessment_cycles(id) on delete cascade,
  dimension_id  uuid not null references dimensions(id),
  user_id       uuid not null references profiles(id),
  role_at_vote  text not null check (role_at_vote in ('team','po','tl','sm')),
  stage         int  not null references stages(number),
  created_at    timestamptz not null default now(),
  unique (cycle_id, dimension_id, user_id)
);

create index if not exists idx_votes_cycle on votes(cycle_id);

create table if not exists proposals (
  cycle_id      uuid not null references assessment_cycles(id) on delete cascade,
  dimension_id  uuid not null references dimensions(id),
  stage         numeric(3,1) not null check (stage >= 1 and stage <= 4),
  decided_by    text not null check (decided_by in ('consensus','sm_final')),
  divergence    boolean not null default false,
  notes         text,
  primary key (cycle_id, dimension_id)
);

create table if not exists homologations (
  cycle_id         uuid not null references assessment_cycles(id) on delete cascade,
  dimension_id     uuid not null references dimensions(id),
  official_stage   numeric(3,1) not null check (official_stage >= 1 and official_stage <= 4),
  adjusted         boolean not null default false,
  justification    text,
  am_user_id       uuid not null references profiles(id),
  anchors_snapshot jsonb,
  created_at       timestamptz not null default now(),
  primary key (cycle_id, dimension_id),
  constraint adj_needs_reason check (not adjusted or justification is not null)
);

create table if not exists anchor_readings (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references teams(id),
  anchor_id   uuid not null references anchors(id),
  cycle_id    uuid references assessment_cycles(id),
  value       numeric,
  verdict     text check (verdict in ('sustains','conflicts','limit','na')),
  read_at     timestamptz not null default now()
);

create index if not exists idx_readings_team on anchor_readings(team_id, read_at desc);

create table if not exists kaizens (
  id             uuid primary key default gen_random_uuid(),
  team_id        uuid not null references teams(id),
  cycle_id       uuid references assessment_cycles(id),
  dimension_id   uuid references dimensions(id),
  title          text not null,
  from_stage     int references stages(number),
  to_stage       int references stages(number),
  owner_id       uuid references profiles(id),
  status         text not null default 'backlog'
    check (status in ('backlog','doing','done','dropped')),
  anchor_id      uuid references anchors(id),
  baseline_value numeric,
  target_value   numeric,
  result_value   numeric,
  due_date       date,
  source         text not null default 'model' check (source in ('model','custom')),
  created_at     timestamptz not null default now()
);

create index if not exists idx_kaizens_team on kaizens(team_id, status);

-- ────────────────────────────────────────────────────────────
-- 4. VIEWS DE LEITURA
-- ────────────────────────────────────────────────────────────

create or replace view v_cycle_scores as
select c.id as cycle_id, c.team_id, c.quarter, c.migrated_scale,
       d.id as dimension_id, d.key as dim_key, d.name as dim_name,
       a.key as axis_key, h.official_stage
from assessment_cycles c
join homologations h on h.cycle_id = c.id
join dimensions d on d.id = h.dimension_id
join axes a on a.id = d.axis_id
where c.status = 'official';

create or replace view v_quarter_comparison as
select team_id, quarter, dim_key, dim_name, axis_key, official_stage, migrated_scale,
       lag(official_stage) over (partition by team_id, dim_key order by quarter) as prev_stage
from v_cycle_scores;

create or replace view v_axis_scores as
select cycle_id, team_id, quarter, axis_key,
       round(avg(official_stage), 1) as axis_score
from v_cycle_scores
group by cycle_id, team_id, quarter, axis_key;
