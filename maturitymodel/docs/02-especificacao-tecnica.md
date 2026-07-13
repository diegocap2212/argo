# Portal MMA · Especificação técnica v1
## Schema alvo, segurança, integração Locavia e plano de migração

**Stack confirmada:** Supabase (projeto `cvkcngrmnfwupstyrpsd`) · Vite + React + TS + shadcn/ui · Vercel · supabase-js v2.81.
**Ação prévia obrigatória:** corrigir `supabase/config.toml`, que aponta para `chqsdabdjrcajybgzucm` (projeto antigo). Alinhar com o `.env` antes de qualquer migration, ou o CLI vai aplicar migrations no projeto errado.

---

## 0. Decisão de arquitetura de informação (front)

Contexto de squad sai da navegação global. O modelo é:

- **Header:** dropdown de squad (squad ativo + badge de pendência por squad, ex.: "Esteira · votação aberta"). Trocar o squad recarrega as mesmas seções no novo contexto.
- **Sidebar (global, fixa):** Início · Torre · Guia do modelo · Administração.
- **Seções do squad ativo** (abas horizontais abaixo do header ou bloco único na sidebar): Jornada · Minha avaliação · Workshop · Homologação · Plano · Métricas · Comparativo.

Um SM com 3 squads navega pelas pendências do Início ou pelo dropdown; a navegação nunca se multiplica por squad.

---

## 1. Schema atual (mapeado do banco em produção)

| Tabela | Papel hoje | Destino |
|---|---|---|
| `teams` | squads | evolui (novas colunas) |
| `assessments` | assessment por time, flag `is_official` | substituída por `assessment_cycles` |
| `assessment_theme_scores` | nota por tema × perspectiva | dividida em `votes` + `proposals` + `homologations` |
| `assessment_answers` | respostas (pouco usada; `questions` está vazia) | descontinuada |
| `custom_kaizens` | kaizens manuais | absorvida por `kaizens` |
| `user_roles` | papéis | absorvida por `squad_members` (papel é por squad, não global) |
| `profiles` | perfil do usuário | mantida |
| `themes` (10) | temas | substituída por `dimensions` |
| `levels` (5, 0–4) | níveis | substituída por `stages` (4, 1–4) |
| `theme_level_descriptions` (50) | conteúdo | substituída por `dimension_stage_descriptions` (40, conteúdo novo do doc v1) |
| `questions` (vazia) | nunca populada | removida |

---

## 2. Schema alvo — DDL

### 2.1 Conteúdo do modelo (referência, versionável)

```sql
create table axes (
  id            uuid primary key default gen_random_uuid(),
  key           text unique not null,            -- 'processo' | 'produto' | 'time'
  name          text not null,
  owner_role    text not null,                   -- 'sm' | 'po' | 'all'
  display_order int not null
);

create table stages (                             -- escala única, 4 estágios
  number        int primary key check (number between 1 and 4),
  name          text not null,                   -- 'Formação e Alinhamento Inicial'...
  legacy_name   text not null,                   -- 'Formativo/Reativo', 'Visível'...
  tuckman       text not null,                   -- 'Forming'...'Performing'
  description   text not null                    -- texto da LM (andar de cima)
);

create table dimensions (
  id            uuid primary key default gen_random_uuid(),
  axis_id       uuid not null references axes(id),
  key           text unique not null,            -- 'metricas_indicadores'...
  name          text not null,
  description   text not null,
  narrative     text,                            -- narrativa de abertura
  owner_roles   text[] not null default '{}',    -- {'sm'} | {'po'} | {'sm','tl'} (DoD)
  display_order int not null
);

create table dimension_stage_descriptions (       -- 10 × 4 = 40 linhas (andar de baixo)
  id            uuid primary key default gen_random_uuid(),
  dimension_id  uuid not null references dimensions(id) on delete cascade,
  stage_number  int  not null references stages(number),
  description   text not null,                   -- texto rico completo
  short_text    text not null,                   -- frase de reconhecimento (tela de voto)
  example       text,
  kaizen_hint   text,                            -- sugestão de kaizen do estágio
  unique (dimension_id, stage_number)
);

create table anchors (                            -- âncoras de dados por dimensão
  id            uuid primary key default gen_random_uuid(),
  dimension_id  uuid not null references dimensions(id),
  name          text not null,                   -- 'Defasagem do painel'
  metric_key    text not null,                   -- chave na API Locavia, ex 'board.staleness_days'
  unit          text,
  comparator    text not null,                   -- '<=', '>=', 'between'
  stage_targets jsonb not null,                  -- {"2": 1, "3": 1, "4": 1} valor-alvo por estágio
  active        boolean not null default true
);
```

### 2.2 Organização

```sql
-- profiles já existe (id = auth.users.id); adicionar se faltar:
alter table profiles add column if not exists full_name text;

alter table teams
  add column if not exists tower text default 'LM',
  add column if not exists locavia_team_key text,   -- chave do squad na API do Locavia
  add column if not exists status text default 'active';  -- active|forming|faseout

create table squad_members (                      -- papel É por squad
  team_id   uuid not null references teams(id) on delete cascade,
  user_id   uuid not null references profiles(id) on delete cascade,
  role      text not null check (role in ('team','po','tl','sm','am')),
  primary key (team_id, user_id, role)
);
```

### 2.3 Ciclo de assessment (1 por quarter)

```sql
create table assessment_cycles (
  id            uuid primary key default gen_random_uuid(),
  team_id       uuid not null references teams(id),
  quarter       text not null,                   -- '2026Q3'
  status        text not null default 'voting'
                check (status in ('voting','workshop','proposed','homologation','official','archived')),
  workshop_at   date,
  officialized_at timestamptz,
  homologated_by  uuid references profiles(id),  -- AM
  previous_cycle_id uuid references assessment_cycles(id),
  migrated_scale  boolean not null default false, -- true p/ ciclos convertidos da escala 0–4
  unique (team_id, quarter)
);

create table votes (                              -- votação silenciosa individual
  id            uuid primary key default gen_random_uuid(),
  cycle_id      uuid not null references assessment_cycles(id) on delete cascade,
  dimension_id  uuid not null references dimensions(id),
  user_id       uuid not null references profiles(id),
  role_at_vote  text not null,                   -- congela o papel no momento do voto
  stage         int  not null references stages(number),
  created_at    timestamptz not null default now(),
  unique (cycle_id, dimension_id, user_id)
);

create table proposals (                          -- nota fechada no workshop
  cycle_id      uuid not null references assessment_cycles(id) on delete cascade,
  dimension_id  uuid not null references dimensions(id),
  stage         numeric(3,1) not null,           -- decimal preservado (2.5)
  decided_by    text not null check (decided_by in ('consensus','sm_final')),
  divergence    boolean not null default false,  -- houve gap >= 2 entre perspectivas
  notes         text,
  primary key (cycle_id, dimension_id)
);

create table homologations (                      -- crivo do AM, por dimensão
  cycle_id       uuid not null references assessment_cycles(id) on delete cascade,
  dimension_id   uuid not null references dimensions(id),
  official_stage numeric(3,1) not null,
  adjusted       boolean not null default false,
  justification  text,                           -- obrigatória se adjusted (constraint abaixo)
  am_user_id     uuid not null references profiles(id),
  anchors_snapshot jsonb,                        -- estado das âncoras no momento do crivo
  created_at     timestamptz not null default now(),
  primary key (cycle_id, dimension_id),
  constraint adj_needs_reason check (not adjusted or justification is not null)
);

create table anchor_readings (                    -- leituras vivas do Locavia
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references teams(id),
  anchor_id   uuid not null references anchors(id),
  cycle_id    uuid references assessment_cycles(id),  -- null = leitura de rotina
  value       numeric,
  verdict     text check (verdict in ('sustains','conflicts','limit','na')),
  read_at     timestamptz not null default now()
);

create table kaizens (
  id            uuid primary key default gen_random_uuid(),
  team_id       uuid not null references teams(id),
  cycle_id      uuid references assessment_cycles(id),
  dimension_id  uuid references dimensions(id),
  title         text not null,
  from_stage    int references stages(number),
  to_stage      int references stages(number),
  owner_id      uuid references profiles(id),
  status        text not null default 'backlog' check (status in ('backlog','doing','done','dropped')),
  anchor_id     uuid references anchors(id),      -- métrica-alvo
  baseline_value numeric,                         -- capturada na criação
  target_value   numeric,
  result_value   numeric,                         -- capturada na conclusão
  due_date      date,
  source        text not null default 'model' check (source in ('model','custom')),
  created_at    timestamptz not null default now()
);
```

### 2.4 Views de leitura

```sql
create view v_cycle_scores as                     -- nota oficial por dimensão + eixo
select c.id cycle_id, c.team_id, c.quarter, d.id dimension_id, d.key dim_key,
       a.key axis_key, h.official_stage
from assessment_cycles c
join homologations h on h.cycle_id = c.id
join dimensions d on d.id = h.dimension_id
join axes a on a.id = d.axis_id
where c.status = 'official';

create view v_quarter_comparison as               -- matriz squad × quarter (radar/deltas)
select team_id, quarter, dim_key, axis_key, official_stage,
       lag(official_stage) over (partition by team_id, dim_key order by quarter) as prev_stage
from v_cycle_scores;
```

---

## 3. RLS — políticas por tabela

Princípios: conteúdo do modelo é público-autenticado; dados de squad são visíveis a membros do squad + AMs da torre; **voto é sigiloso até a revelação**.

```sql
-- Conteúdo (axes, stages, dimensions, dimension_stage_descriptions, anchors):
--   select: authenticated. insert/update: role 'am' (via função is_am()).

create function is_member(t uuid) returns boolean language sql stable as $$
  select exists (select 1 from squad_members where team_id = t and user_id = auth.uid())
$$;
create function is_am(t uuid) returns boolean language sql stable as $$
  select exists (select 1 from squad_members where team_id = t and user_id = auth.uid() and role = 'am')
$$;

alter table votes enable row level security;
create policy votes_insert on votes for insert
  with check (user_id = auth.uid()
    and exists (select 1 from assessment_cycles c where c.id = cycle_id and c.status = 'voting'
                and is_member(c.team_id)));
create policy votes_select_own on votes for select
  using (user_id = auth.uid());
create policy votes_select_revealed on votes for select   -- revelação: status avançou
  using (exists (select 1 from assessment_cycles c where c.id = cycle_id
                 and c.status <> 'voting' and (is_member(c.team_id) or is_am(c.team_id))));

alter table homologations enable row level security;
create policy homolog_write on homologations for insert
  with check (am_user_id = auth.uid()
    and exists (select 1 from assessment_cycles c where c.id = cycle_id and is_am(c.team_id)));
create policy homolog_read on homologations for select
  using (exists (select 1 from assessment_cycles c where c.id = cycle_id
                 and (is_member(c.team_id) or is_am(c.team_id))));

-- assessment_cycles, proposals, kaizens, anchor_readings: select para membros + AM;
-- write de proposals: SM do squad; write de cycles/kaizens: SM + AM.
-- Transição p/ 'official' apenas via RPC (abaixo), nunca update direto.
```

**RPC de oficialização** (transação única, evita estado inconsistente):

```sql
create function officialize_cycle(p_cycle uuid) returns void
language plpgsql security definer as $$
begin
  if not is_am((select team_id from assessment_cycles where id = p_cycle)) then
    raise exception 'apenas AM homologa';
  end if;
  if (select count(*) from homologations where cycle_id = p_cycle)
     < (select count(*) from dimensions) then
    raise exception 'homologação incompleta';
  end if;
  update assessment_cycles
     set status = 'official', officialized_at = now(), homologated_by = auth.uid()
   where id = p_cycle;
  -- gera kaizens sugeridos a partir dos estágios oficializados (kaizen_hint)
  insert into kaizens (team_id, cycle_id, dimension_id, title, from_stage, to_stage, anchor_id, source)
  select c.team_id, c.id, h.dimension_id, dsd.kaizen_hint,
         floor(h.official_stage)::int, least(floor(h.official_stage)::int + 1, 4),
         (select a.id from anchors a where a.dimension_id = h.dimension_id limit 1), 'model'
  from homologations h
  join assessment_cycles c on c.id = h.cycle_id
  join dimension_stage_descriptions dsd
    on dsd.dimension_id = h.dimension_id and dsd.stage_number = floor(h.official_stage)::int
  where h.cycle_id = p_cycle and floor(h.official_stage) < 4;
end $$;
```

---

## 4. Integração Locavia (âncoras)

**Regra de ouro: o front do MMA nunca fala com o Locavia diretamente.** Credenciais e senha do dashboard ficam em secrets de Edge Function.

- **Edge Function `sync-anchors`** (Deno, cron a cada 6 h + acionável sob demanda no workshop):
  1. Lê `teams.locavia_team_key` + `anchors.metric_key` ativos.
  2. Chama a API do Locavia (`/api/data` etc.) com secret `LOCAVIA_TOKEN`.
  3. Calcula o `verdict` comparando o valor com `anchors.stage_targets` vs o estágio proposto/oficial vigente.
  4. Grava em `anchor_readings` (com `cycle_id` quando houver ciclo em workshop/homologação — vira o snapshot auditável).
- **Contrato de `metric_key` (primeira leva):** `panel.staleness_days`, `board.stale_cards_2d`, `board.done_without_resolution_pct`, `flow.cycle_time_variation_pct`, `flow.adherence_pct`, `sprint.gmud_inside_count`, `quality.return_rate_pct`, `slicing.multi_sprint_pct`.
- Dimensões sem âncora (Comunicação de Valor, Cultura parcial) ficam `na` por design.

---

## 5. Plano de migração (ordem de execução)

**Fase 0 · Preparação**
1. Corrigir `supabase/config.toml` → `cvkcngrmnfwupstyrpsd`.
2. Backup: `pg_dump` do projeto (dashboard → Database → Backups) antes de tudo.
3. Congelar escrita no portal antigo (banner "assessment em manutenção").

**Fase 1 · Estrutura nova (aditiva, sem quebrar o app atual)**
4. Migration 001: criar todas as tabelas/views/funções da seção 2–3. Nada do schema antigo é tocado.
5. Migration 002: seed de conteúdo — `axes` (3), `stages` (4), `dimensions` (10), `dimension_stage_descriptions` (40) a partir do documento *mma-lm-conteudo-v1.md*, `anchors` (primeira leva acima).

**Fase 2 · Migração de dados históricos**
6. `teams` → adicionar `tower`, `locavia_team_key` (de/para manual com os squads do Locavia).
7. `user_roles` → `squad_members` (script; papel global vira papel no(s) squad(s) reais — validação manual do de/para com você).
8. Histórico de assessments antigos → `assessment_cycles` retroativos com `migrated_scale = true`, `status = 'official'` (os que tinham `is_official`) e quarter inferido pela data. Notas de `assessment_theme_scores` convertidas:
   - **Escala:** níveis 0 e 1 → estágio 1; 2 → 2; 3 → 3; 4 → 4.
   - **Temas → dimensões (de/para):** Cadências e Rituais → Cadência & Sprint · Políticas e Def. de Pronto → média vai para Backlog & DoR **e** DoD (duplicada com flag) · Quebra de Trabalho → Fatiamento · Propósito e Contexto → Visão & Roadmap · Métricas e Previsibilidade → Métricas & Indicadores · Limite WIP + Gestão de Fluxo → média em Previsibilidade & Fluxo · Cultura + Melhoria Colaborativa → média em Cultura, Conhecimento & Melhoria · Visualização → absorvida em Métricas & Indicadores · **Validação de Épicos e Comunicação de Valor nascem sem histórico** (null nos quarters antigos; o comparativo trata como "não medido").
   - A nota migrada vai direto em `homologations` (com `justification = 'migração de escala 5→4'` e `am_user_id` = você).
9. `custom_kaizens` → `kaizens` com `source = 'custom'`.

**Fase 3 · Cutover**
10. Front novo (IA da seção 0) atrás de feature flag; rotas antigas (`/iceberg`, `/vector`, `/guide`, `/tutorial`) redirecionam para o Guia unificado.
11. Rodar 1 ciclo piloto completo (sugestão: Chatbot Q4) no fluxo novo antes de abrir para a torre.
12. Após 1 quarter estável: migration de limpeza descontinua `assessments`, `assessment_theme_scores`, `assessment_answers`, `questions`, `themes`, `levels`, `theme_level_descriptions` (manter dump arquivado).

**Riscos e mitigação**
- *Comparativo entre escalas:* ciclos `migrated_scale = true` aparecem no comparativo com marcador visual ("escala convertida") — nunca esconder a conversão do usuário.
- *Papel por squad errado no de/para:* fase 2.7 exige validação humana; é a única etapa sem automação segura.
- *Âncora com dado ruim:* `verdict` = `limit` existe para zona cinzenta; regra de conflito começa **branda** (sinaliza, não trava), endurece quando a qualidade do sync estabilizar.
