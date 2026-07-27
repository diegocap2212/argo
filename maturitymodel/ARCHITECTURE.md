# Arquitetura — Portal MMA

> Documento de referência técnica completo: stack, banco de dados, modelo de
> acesso, e as práticas de governança para editar este projeto com segurança.
> Escrito em 2026-07-10, logo após o primeiro deploy em produção. Se algo
> aqui divergir do código, **o código manda** — mas isto deveria ficar
> atualizado a cada mudança estrutural (ver seção "Governança" no fim).
>
> Para o estado operacional do momento (o que falta, quem tem conta, o que
> está pendente) veja `STATUS.md`. Este arquivo é sobre **como o sistema é
> construído**, não sobre o que falta fazer hoje.
>
> ⚠️ **DEFASADO em duas mudanças estruturais grandes** que aconteceram depois
> deste texto ter sido escrito (2026-07-10) e que **não foram propagadas para
> cá ainda**: (1) o **cutover do Portal NEO** (2026-07-14) — o MMA não é mais
> um deploy Vercel separado, é servido em `neo-lm.vercel.app/maturity/**`
> (ver §10, corrigido) com login unificado (Supabase/OTP no hub, não mais
> email+senha próprio do MMA — §4.1 abaixo ainda descreve o modelo ANTIGO);
> (2) o **redesenho de roles** (2026-07-15) — `is_any_am()` não é mais a regra
> viva, existe admin global por e-mail (`is_portal_admin()`); §4.2 e §8.4
> foram corrigidos, mas o resto do texto ainda assume o modelo antigo em
> alguns exemplos. Fonte de verdade do estado atual: `HANDOFF.md` da raiz do
> monorepo e `docs/ROLES-REDESIGN.md` deste app.
>
> ⚠️ **Terceira mudança estrutural (2026-07-27), do hardening pós-code-review:**
> (3) a Edge Function **`sync-anchors` foi partida em duas** —
> `sync-anchors-user` (valida o JWT do usuário e exige SM daquele squad ou AM/admin,
> via as funções SQL de papel) e `sync-anchors-cron` (exige `ANCHOR_SYNC_CRON_SECRET`
> em header, guardada no Vault), com a lógica comum em `functions/_shared/`. Toda
> menção a "a Edge Function `sync-anchors`" neste documento se refere ao desenho
> ANTIGO, em que a função recebia `service_role` por env e **autorizava com ela** —
> ou seja, qualquer portador da anon key (pública, e hardcoded na migration do cron)
> disparava sync de qualquer squad. `service_role` continua sendo usado para
> **gravar**, mas só depois de a autorização passar. Também nesse dia: `npm run
> typecheck` (`tsc --noEmit` com `files: []`) não verificava nada e virou `tsc -b`;
> a policy `homolog_update` foi corrigida para exigir `is_portal_am()`; e o app
> ganhou suíte de RLS em Postgres efêmero. Ver `docs/HARDENING-EM-ANDAMENTO.md`
> na raiz do monorepo.

## 1. O que é este projeto

O Portal MMA é a evolução do antigo "Maturity Model" (app de autoavaliação
0-4, um dono por time) para um **Modelo de Maturidade Ágil** com ciclo
completo de governança: **sessão colaborativa** (o SM/AM apresenta cada
dimensão e registra a nota de consenso do grupo; os demais acompanham em
leitura) → homologação por um Agile Master → oficialização → plano de evolução
(kaizens) → comparação entre quarters. É fundido com métricas objetivas puxadas
**direto do Jira** como "âncoras" que sustentam ou contestam a nota de consenso.
(Um modelo anterior usava voto individual sigiloso + revelação; foi substituído
pela sessão colaborativa — ver §8.3 e a migration `20260710130000`.)

Este repositório **é** o app antigo evoluído no próprio lugar — não é um
projeto novo. A decisão de evoluir em vez de reescrever do zero foi tomada
depois de esbarrar num problema real: um repo novo (`mma-portal`, hoje
descontinuado) não tinha o histórico de migrations do banco, que já existia
aqui. Ver commit `9c3e291` para o ponto exato dessa virada.

## 2. Stack

- **Front-end**: Vite 5 + React 18.3 + TypeScript 5.8 (SWC), `react-router-dom` 6, `@tanstack/react-query` 5, Tailwind 3.4, shadcn/ui (Radix), `recharts` 2, `@hello-pangea/dnd`.
- **Backend**: Supabase (Postgres + Auth + Storage + Edge Functions/Deno). Projeto: `cvkcngrmnfwupstyrpsd` (nome "maturitymodel" no dashboard).
- **Deploy**: ~~Vercel, projeto `maturitymodel`, deploy automático a cada push em `main`. URL de produção: `https://maturitymodel-ashen.vercel.app`.~~ **DEFASADO desde o cutover (2026-07-14):** hoje sai no build composto do monorepo `argo` (projeto Vercel `neo-lm`, base `/maturity/`), servido em `https://neo-lm.vercel.app/maturity/**`. O projeto antigo só responde redirect 308. Ver §10.
- **Integração externa**: Jira Cloud (via API REST v3, direto na Edge Function). A lógica de sync foi portada do `locavia-dashboard` (outro app nosso), que continua sendo a referência da regra de negócio de campos/status.

## 3. Estrutura do repositório

```
src/
├── App.tsx                    ← roteamento raiz (todas as rotas do MMA + redirects legados)
├── main.tsx, index.css        ← bootstrap + tokens do Design System
├── theme/ThemeProvider.tsx    ← contexto claro/escuro (localStorage "venice-theme")
├── hooks/
│   ├── useAuth.tsx            ← AuthProvider (login real, sem fallback anônimo)
│   ├── useSquadRole.ts        ← papéis do usuário num squad específico (+ primaryRole determinístico)
│   ├── useMySquads.ts         ← squads do usuário logado + pendências
│   ├── useTeamLevels.ts       ← nível médio (10 dimensões) por squad, último ciclo oficial
│   ├── useTorreData.ts        ← squads visíveis + leitura de aderência (Torre)
│   ├── useAxisScores.ts       ← notas por eixo (Processo/Produto/Time) — AxisPills do header
│   ├── useCycleData.ts        ← TODO o ciclo: dimensões, votos, propostas, homologações, RPC, kaizens
│   ├── useAnchors.ts          ← âncoras + leituras (tela Métricas) + trigger de sync
│   ├── useQuarterComparison.ts← v_quarter_comparison (tela Comparativo)
│   ├── useModelContent.ts     ← eixos/estágios (tela Guia)
│   ├── useAdminData.ts        ← CRUD de squads/squad_members (tela Admin)
│   └── use-toast.ts, use-mobile.tsx  ← utilitários shadcn (legado, reaproveitados)
├── components/
│   ├── ui/                    ← ~50 componentes shadcn/ui (não editar sem necessidade — vieram do gerador)
│   ├── layout/AppShell.tsx    ← sidebar global + topbar (2 modos: título simples / SquadSwitcher+subnav)
│   ├── layout/SquadSubNav.tsx ← as 7 abas do squad, visibilidade por papel
│   ├── mma/                   ← componentes específicos do domínio (SquadSwitcher, CycleJourney, AxisPills, VeniceLogo)
│   └── ProtectedRoute.tsx     ← ProtectedRoute (exige sessão) + RequireAM (exige papel am em algum squad)
├── pages/                     ← as 13 rotas do MMA (Login, Inicio, Torre, Guia, AdminMMA, ResetPassword)
│   └── squad/                 ← rotas por squad (Jornada, Sessao, Homologacao, Plano, Metricas, Comparativo, Apresentar)
├── types/mma.ts                ← tipos do domínio + CYCLE_TRANSITIONS (máquina de estados)
└── integrations/supabase/     ← client.ts (singleton) + types.ts (gerado via `supabase gen types`)

supabase/
├── config.toml                 ← config local (project_id, auth). NUNCA editar auth sem ler o aviso no topo do arquivo.
├── migrations/                 ← 36 migrations legadas (2025-11 a 2026-07, geradas pelo Lovable/manuais) + 3 novas do MMA (20260710*)
└── functions/sync-anchors/     ← Edge Function Deno, integração com o Jira (direto)

docs/
├── 01-modelo-conteudo.md       ← spec original do conteúdo (10 dimensões × 4 estágios) — histórico, fonte do seed
├── 02-especificacao-tecnica.md ← spec técnica original (schema, RLS, RPC) — histórico, ver §8 pra divergências reais
└── 03-front-end-spec.md        ← spec de front original (rotas, telas, DS) — histórico, quase 100% implementado como descrito

prototype/mma-prototipo-v2.html ← protótipo HTML estático, referência visual pixel-a-pixel (não é código do app)
```

**Páginas legadas** (`Index.tsx`, `Auth.tsx`, `Dashboard.tsx`, `Admin.tsx` [antigo], `TeamDetail.tsx`, `Assessment.tsx`, `NewAssessment.tsx`, `AssessmentResults.tsx`, `EvolutionPlan.tsx`, `Report.tsx`, `LevelGuide.tsx`, `Welcome.tsx`, `Tutorial.tsx`) continuam em `src/pages/` **mas não estão mais roteadas** em `App.tsx`. Não foram apagadas de propósito — preservam a implementação anterior caso algo precise ser resgatado. São código morto do ponto de vista de execução.

## 4. Autenticação e controle de acesso

### 4.1 Login — ⚠️ **DESCRIÇÃO HISTÓRICA, NÃO É O FLUXO ATUAL**

> Desde o cutover do Portal NEO (2026-07-14) **o MMA não tem login próprio**: a sessão é
> criada por **Magic Link/OTP no NEO Hub** e vale nesta app porque as duas vivem na mesma
> origem (`neo-lm.vercel.app`) e portanto compartilham o `localStorage` do Supabase. O
> acesso a `/maturity/**` é barrado na **borda** pelo `middleware.ts` da raiz do monorepo,
> que exige o cookie `neo_session`. Não há email+senha, nem convite por senha, nem tela de
> reset em uso. `Login.tsx`/`ResetPassword.tsx` seguem no repositório como código legado.
>
> O texto abaixo descreve o modelo ANTIGO e fica registrado porque a **configuração de
> Auth no Supabase** (Site URL, Redirect URLs) foi feita nele e a advertência sobre
> `supabase config push` continua valendo integralmente.

**Email + senha real, obrigatório.** Não há sessão anônima (foi usada temporariamente durante o desenvolvimento e desligada antes de produção — ver `src/hooks/useAuth.tsx`). Não há cadastro self-service: contas são criadas por um AM via **convite por email do Supabase** (`POST /auth/v1/invite`, endpoint admin) ou, pra contas já existentes, via **recuperação de senha** (`POST /auth/v1/recover`, client-side). Em nenhum dos dois fluxos o time de desenvolvimento vê ou manipula senha — a pessoa define a própria via link recebido por email.

`src/pages/ResetPassword.tsx` é a tela que completa esse fluxo: o link do email autentica temporariamente (Supabase processa o token da URL antes de chegar na página, evento `PASSWORD_RECOVERY` via `onAuthStateChange`), a tela só pede a senha nova e chama `supabase.auth.updateUser({password})`.

**Configuração crítica no Supabase Dashboard** (Authentication → URL Configuration), sem a qual os links de email quebram:
- ~~Site URL: `https://maturitymodel-ashen.vercel.app`~~ → hoje **`https://neo-lm.vercel.app/maturity`**
- ~~Redirect URLs: inclui `https://maturitymodel-ashen.vercel.app/reset-password`~~ → a lista atual está em `supabase/config.toml`

Isso está espelhado em `supabase/config.toml` `[auth]` — que era a **fonte do risco**: o arquivo
ficou com os valores do domínio descontinuado depois do cutover, então um `supabase config push`
feito por outro motivo reintroduziria redirect quebrado no projeto vivo. Corrigido em 2026-07-27.
A versão original foi aplicada via `supabase config push` em 2026-07-10. **Cuidado**: esse comando reescreve a seção `[auth]` inteira (não é patch parcial) — sempre revisar o diff mostrado antes de confirmar, e nunca rodar sem antes conferir que todo campo que já está em produção (MFA, confirmação de email) está explicitamente declarado no arquivo local. Já causou um incidente real antes desta sessão (ver o comentário no topo do arquivo).

### 4.2 Papéis e RLS — **ATUALIZADO 2026-07-15** (redesenho de roles)

Papel é **por squad**, guardado em `squad_members (team_id, user_id, role)` — chave primária composta, então uma pessoa pode ter múltiplos papéis no mesmo squad (ex.: `team`+`sm`). Papéis: `team`, `po`, `tl`, `sm`, `am`.

- `is_member(team_id)`, `is_am(team_id)`, `is_sm(team_id)` — funções SQL `SECURITY DEFINER` que checam papel **naquele squad específico**. Inalteradas.
- `is_any_am()` — **APOSENTADA**. Existia e concedia poder global a qualquer AM (ver histórico logo abaixo); nenhuma policy viva usa mais essa função (confirmado por query direta ao banco em 2026-07-15). Mantida no schema só por compatibilidade histórica das migrations antigas.
- `is_portal_admin()` (nova) — admin global explícito, por **e-mail de login** (tabela `portal_admins`: `ext.diego.caporusso@` e `ext.tiago.massaro@lmmobilidade.com.br`), não por papel em squad. É quem cria/exclui squad, reinicia assessment, edita conteúdo do modelo, e vê tudo.
- `sqm_write` (gestão de membros) hoje é `is_portal_admin() OR is_am(team_id) OR is_sm(team_id)` **com uma trava adicional**: só admin global ou um AM já existente do squad pode gravar `role='am'` — um SM não consegue se auto-promover (migration `20260715150000`, corrigindo uma escalada de privilégio real encontrada em QA).

**Histórico (não se aplica mais, preservado para contexto)**: até 2026-07-15, `is_any_am()` dava a
qualquer AM (de qualquer squad) poder de ler/escrever TUDO — incluindo a "armadilha de bootstrap"
que exigia `service_role` pra criar o primeiro AM do sistema. O redesenho substituiu isso por admin
global explícito (`portal_admins`), então **não existe mais essa armadilha**: o admin cadastrado na
tabela já pode fazer tudo via app normal, sem precisar de `service_role`. Detalhe completo da
migração e as 4 decisões do Diego: `docs/ROLES-REDESIGN.md`.

No front, `useSquadRole(teamId)` resolve os papéis do usuário **naquele squad**. O hook
`useIsPortalAdmin()` (RPC `is_portal_admin`) substitui o antigo "AM em qualquer squad" para
controlar a visibilidade de ações de admin global; `RequireManager` (antigo `RequireAM`) guarda
`/admin` exigindo só SM/AM em algum squad OU admin — a UI então esconde as ações que a RLS negaria
para quem não é admin global.

### 4.3 Rotas protegidas

- `ProtectedRoute` — exige sessão válida, senão redireciona pra `/login`.
- `RequireAM` — além da sessão, exige `am` em pelo menos um squad, senão redireciona pra `/`. Usado só em `/admin`.
- `/s/:teamId/apresentar` fica fora do `AppShell` (fullscreen), mas ainda dentro de `ProtectedRoute`.
- `/login` e `/reset-password` são as únicas rotas públicas.

## 5. Mapa de rotas (13 + redirects)

| Rota | Componente | Acesso |
|---|---|---|
| `/login` | `Login` | público |
| `/reset-password` | `ResetPassword` | público (sessão de recuperação) |
| `/` | `Inicio` | autenticado |
| `/torre` | `Torre` | autenticado |
| `/guia` | `Guia` | autenticado |
| `/admin` | `AdminMMA` | `RequireAM` |
| `/s/:teamId` | `Jornada` (hub) | membro do squad |
| `/s/:teamId/sessao` | `Sessao` | facilitador (SM/AM) edita; demais membros veem leitura |
| `/s/:teamId/homologacao` | `Homologacao` | AM daquele squad |
| `/s/:teamId/plano` | `Plano` | membro do squad |
| `/s/:teamId/metricas` | `Metricas` | membro do squad |
| `/s/:teamId/comparativo` | `Comparativo` | membro do squad |
| `/s/:teamId/apresentar` | `Apresentar` | autenticado, fullscreen |

Redirects legados: `/auth→/login`, `/welcome→/`, `/dashboard→/torre`, `/guide|/iceberg|/vector|/tutorial→/guia`, `/team/:teamId/...→/s/:teamId/...` (mapeamento por sufixo).

## 6. Design System — "Venice by blite"

Paleta **verde** (`--accent: #2be86b`), não a magenta genérica da Blite (`blite-ds` em `Desktop/localhost/blite-ds` — DS diferente, não usado aqui). Fonte de verdade dos tokens: `src/index.css` `:root`/`[data-theme="dark"]`, espelhando `locavia-dashboard/src/App.css`.

- **Ponte shadcn**: os slots semânticos que os ~50 componentes `src/components/ui/*` esperam (`--background`, `--primary`, `--accent`, etc.) são mapeados pros tokens Venice logo abaixo do bloco de tokens crus em `index.css`. **Importante**: o slot `--accent` do shadcn (hover neutro de menus/tabs) é **diferente** do `--accent` verde do DS — o verde vivo fica em `venice.accent` (Tailwind) / `Button variant="accent"`, reservado pra CTAs de avanço de ciclo (Confirmar voto, Oficializar). Já houve uma colisão de nomes nisso — corrigida, mas é fácil reintroduzir se alguém "simplificar" o CSS sem entender essa separação.
- **Tokens crus** ficam expostos como `venice.*` no `tailwind.config.ts` (`bg-venice-accent`, `text-venice-textSecondary`, etc.) pra uso direto fora dos slots shadcn.
- **Tipografia**: Inter (corpo/UI) + Newsreader serif (títulos, números grandes tipo "2.6", `font-serif`).
- **Tokens legados** (`--brand-magenta`, `--brand-violet`, `--navy`, em HSL) continuam em `index.css` pras páginas não-roteadas que ainda os usam (`hero-glow`, `brand-gradient`). Não remover sem checar se alguma página legada depende.
- Tema alterna via atributo `data-theme` no `<html>` (não `.dark` class) — `ThemeProvider` cuida disso. `tailwind.config.ts` tem `darkMode: ["class", '[data-theme="dark"]']` pra aceitar os dois, mas o app só usa o atributo.

## 7. Camada de dados — padrão dos hooks

Todo acesso a dados passa por hooks em `src/hooks/`, usando `@tanstack/react-query`. Padrão consistente:

- **Queries de leitura** (`useX`): `queryFn` chama `supabase.from(...)`, com `try/catch` ou checagem de `error` que faz `console.warn` e retorna um valor vazio seguro (`[]`, `{}`, `null`) em vez de lançar — isso existia desde antes das migrations serem aplicadas (pra não quebrar a UI enquanto o schema não existia) e continua útil como defesa geral contra RLS negando acesso.
- **Mutations** (`useCastVote`, `useSaveProposal`, `useSaveHomologation`, `useOfficializeCycle`, `useMoveKaizen`, etc.): usam `useMutation` + `invalidateQueries` no `onSuccess` pra manter o cache do react-query consistente.
- **Chave de query** sempre inclui os parâmetros relevantes (`["cycle", teamId]`, `["my-votes", cycleId, userId]`) pra cache correto por squad/usuário.

`useCycleData.ts` é o hub central — concentra dimensões, descrições, ciclo, votos, propostas, homologações, a RPC de oficialização e kaizens. Deliberadamente não foi quebrado em arquivos menores porque as entidades são fortemente relacionadas (todo o ciclo de vida do assessment).

## 8. Banco de dados

### 8.1 Como o schema chegou até aqui

O banco (`cvkcngrmnfwupstyrpsd`) tem **duas gerações de migrations**:
1. **36 migrations legadas** (`20251113...` a `20260706...`) — o Maturity Model original (Lovable-gerado + 3 manuais). Tabelas: `themes`, `levels`, `theme_level_descriptions`, `assessments`, `assessment_theme_scores`, `assessment_answers`, `questions` (morta, nunca usada), `custom_kaizens`, `user_roles`+`app_role` enum, `profiles`, `teams` (já existia, reaproveitada).
2. **3 migrations do MMA** (`20260710120000/100/200_mma_*.sql`) — **aditivas, não tocam nas tabelas legadas**. Criam todo o schema novo descrito abaixo. Precisaram de timestamp real (não `001/002/003`) porque o Supabase CLI recusa inserir migrations "no passado" da linha do tempo já aplicada.

As tabelas legadas **continuam no banco, intactas, só não são mais usadas pelo front** (que agora só rotea pras telas do MMA). `teams` é a única tabela genuinamente compartilhada entre as duas gerações — por isso o squad "Time" (dado real pré-MMA) aparece nas telas novas (Torre, Admin) ao lado dos squads criados para o MMA.

### 8.2 Schema do MMA (tabelas novas)

**Conteúdo do modelo** (referência, versionável — populado pelo seed, raramente muda):
- `axes` (id, key, name, owner_role, display_order) — 3 linhas: processo/produto/time.
- `stages` (number PK 1-4, name, legacy_name, tuckman, description) — 4 linhas.
- `dimensions` (id, axis_id→axes, key, name, description, narrative, owner_roles text[], display_order) — 10 linhas.
- `dimension_stage_descriptions` (id, dimension_id→dimensions, stage_number→stages, description, short_text, example, kaizen_hint, anchor_note, unique(dimension_id,stage_number)) — 40 linhas.
- `anchors` (id, dimension_id→dimensions, name, metric_key, unit, comparator `<=|>=|between`, stage_targets jsonb, active) — 8 linhas.

**Organização** (`profiles`/`teams` alterados aditivamente — `add column if not exists`):
- `profiles` ganhou `full_name`.
- `teams` ganhou `tower`, `locavia_team_key`, `status` (`active|forming|faseout`).
- `squad_members` (team_id, user_id, role, PK composta) — nova.

**Ciclo**:
- `assessment_cycles` (id, team_id, quarter, status, workshop_at, officialized_at, homologated_by, previous_cycle_id, migrated_scale, unique(team_id,quarter)).
- `votes` (id, cycle_id, dimension_id, user_id, role_at_vote, stage int 1-4, unique(cycle_id,dimension_id,user_id)).
- `proposals` (PK(cycle_id,dimension_id), stage **numeric(3,1)** — decimal, ex. 2.5, decided_by `consensus|sm_final`, divergence bool, notes).
- `homologations` (PK(cycle_id,dimension_id), official_stage numeric(3,1), adjusted, justification, am_user_id, anchors_snapshot jsonb — constraint: `adjusted=false OR justification IS NOT NULL`).
- `anchor_readings` (id, team_id, anchor_id, cycle_id nullable, value, verdict `sustains|conflicts|limit|na`, read_at).
- `kaizens` (id, team_id, cycle_id, dimension_id, title, from_stage, to_stage, owner_id, status `backlog|doing|done|dropped`, anchor_id, baseline_value, target_value, result_value, due_date, source `model|custom`).

**Views**: `v_cycle_scores` (nota oficial por dimensão+eixo, `where status='official'`), `v_quarter_comparison` (squad×quarter com `lag()` pra comparar com quarter anterior), `v_axis_scores` (média por eixo, arredondada a 1 casa).

### 8.3 Máquina de estados do ciclo

`CYCLE_TRANSITIONS` em `src/types/mma.ts` — a UI nunca oferece uma transição fora daqui.
**Modelo atual (sessão colaborativa)** — o voto individual sigiloso foi substituído
por uma sessão facilitada onde o SM/AM registra a nota de consenso do grupo (ver
migration `20260710130000_mma_collaborative_session.sql`):

```
session      → [homologation]            // SM/AM fecha as 10 notas e envia
homologation → [official, session]       // session = AM devolve pra sessão
official     → [archived]                // só via RPC officialize_cycle
archived     → []
```

Mapeamento jornada↔status (3 estações): Sessão=`session` · Homologação=`homologation` · Plano=`official`.

### 8.4 RLS — regras por tabela — **ATUALIZADO 2026-07-15** (redesenho de roles)

Helpers `SECURITY DEFINER` (`set search_path=public`): `is_member(t)`, `is_am(t)`, `is_sm(t)`,
`is_portal_admin()` (novo — admin global por e-mail, ver §4.2). `is_any_am()` existe na base mas
nenhuma policy viva a referencia mais.

- **Conteúdo do modelo** (axes/stages/dimensions/dimension_stage_descriptions/anchors): leitura para qualquer autenticado, escrita só `is_portal_admin()`.
- **squad_members**: leitura própria + membro + `is_portal_admin()`; escrita por `is_portal_admin() OR is_am(team_id) OR is_sm(team_id)`, **exceto** gravar `role='am'`, que exige admin global ou AM já existente do squad (bloqueia auto-promoção — migration `20260715150000`).
- **teams**: leitura membro + `is_portal_admin()`; update por admin/AM/SM do squad (metadados); **insert (criar squad) só admin**; delete não tem policy direta (só via RPC `delete_squad`, admin).
- **assessment_cycles**: leitura membro + `is_portal_admin()`; insert `is_sm() OR is_am()`; **update com check `status <> 'official'`** — status oficial só muda via RPC.
- **votes**: **tabela morta** no modelo de sessão colaborativa (não há voto individual). Policies removidas na migration `20260710130000`; RLS habilitada sem policy = sem acesso. Mantida no schema só para não fazer drop destrutivo.
- **proposals**: leitura membro/admin; escrita pelo facilitador (`is_sm() OR is_am()`) enquanto `status = 'session'` — é onde a nota de consenso é registrada.
- **homologations**: leitura membro/admin; insert/update pelo AM enquanto `status = 'homologation'`.
- **anchor_readings**: leitura membro/admin; **sem policy de insert** — só `service_role` grava (a Edge Function).
- **kaizens**: leitura e escrita membro/admin.
- **profiles**: leitura restrita a si mesmo, admin global, ou quem compartilha squad (`shares_squad_with`) — diretório fechado (antes era `using(true)`, aberto a qualquer logado). Busca de pessoa por e-mail exato via RPC `find_profile_by_email` (security definer), sem abrir o diretório inteiro.
- **RPCs destrutivos** (`restart_assessment`, `delete_squad`): **só `is_portal_admin()`** — antes eram `is_any_am()` (qualquer AM podia reiniciar/apagar qualquer squad).
- **Views** `v_cycle_scores`/`v_quarter_comparison`/`v_axis_scores`: `security_invoker=true` (antes rodavam como owner e bypassavam a RLS das tabelas base — corrigido junto do redesenho).

### 8.5 RPC `officialize_cycle(p_cycle uuid)`

`SECURITY DEFINER`, transacional. Valida que quem chama é AM do squad do ciclo, valida `count(homologations) = count(dimensions)` (10/10, senão erro "homologação incompleta"), seta `status='official'` + `officialized_at` + `homologated_by`, e **gera os kaizens do plano automaticamente**: para toda dimensão com `floor(official_stage) < 4`, cria um kaizen `source='model'` usando o `kaizen_hint` daquele estágio, `from_stage=floor(official_stage)`, `to_stage=min(floor+1,4)`, linkado à primeira âncora ativa da dimensão. `revoke all from public; grant execute to authenticated`.

## 9. Edge Function `sync-anchors`

Deno, em `supabase/functions/sync-anchors/index.ts`. Único ponto de contato com o **Jira** — **o front nunca fala com o Jira diretamente**. (Versão anterior consumia o `/api/data` do Locavia; trocada por Jira direto para remover a dependência do cookie de sessão do Locavia e o de/para manual.)

- **Auth**: Basic (`base64(email:token)`) no Jira Cloud REST v3, `POST {JIRA_BASE_URL}/rest/api/3/search/jql`, paginação por `nextPageToken`.
- **Mapa squad→Jira**: constante `SQUAD_JIRA` no próprio arquivo, keyed por `teams.name` (os 8 squads), com `teamFieldValues` + `keyPrefixes` — portado de `sm-config.ts` do locavia. Resolve o de/para sem `teams.locavia_team_key` (coluna agora sem uso). `Time` (legado) e qualquer squad fora do mapa → pulado (`skipped: "sem mapa Jira"`).
- **JQL por squad**: `(project in (<keyPrefixes>) or labels in (<teamFieldValues>) or cf[11795] in (...) or cf[12386] in (...)) and type not in (Epic, subTaskIssueTypes()) and updated >= -90d`. Janela de 90 dias pra manter a função leve (difere do locavia, que faz histórico completo num GitHub Action).
- **Normalização + extractors**: `classifyStatus` (porta de `status-classification.ts`), `leadTimeDays` (created→resolved), `isPlanned` (Data de Comprometimento cf[10102]), `furaFila` (cf[10165]), `type`. 4 das 8 fórmulas são interpretações (marcadas "ASSUNÇÃO"): `sprint.gmud_inside_count` (fura fila), `slicing.multi_sprint_pct` (lead time > 10d), `quality.return_rate_pct` (Type=Bug), `flow.adherence_pct` (IsPlanned). **Revisar com quem entende o processo.**
- **Veredito**: compara valor lido com o alvo do estágio de referência (proposta do ciclo aberto em `session`, senão a última nota oficial). Regra branda: até 20% além do alvo = `limit`, além disso = `conflicts`.
- **Secrets** (`supabase secrets set`, projeto `cvkcngrmnfwupstyrpsd`): `JIRA_BASE_URL` (`https://grupolm.atlassian.net`), `JIRA_USER_EMAIL` (`ext.diego.caporusso@lmmobilidade.com.br`), `JIRA_API_TOKEN`, `SB_URL`, `SB_SERVICE_ROLE`. ✅ **Deployada e testada em produção** (2026-07-10): sync do Nivus puxou 163 itens do Jira Grupo LM e gravou 8 leituras com valores reais. Os secrets antigos `LOCAVIA_*` foram removidos. Nota: o token da LM não é recuperável por CLI/MCP (sensível no Vercel do locavia, one-time no Atlassian) — foi fornecido pelo usuário.
- **Invocação**: sob demanda (`POST /functions/v1/sync-anchors {team_id, cycle_id?}`, botão "Sincronizar agora" na Métricas) ou cron (sem body → todos os squads ativos mapeados) — cron ainda não agendado.

## 10. Deploy e infraestrutura — **ATUALIZADO 2026-07-15** (pós-cutover Portal NEO)

> Esta seção descrevia um deploy Vercel próprio e independente para o MMA. Isso **não existe mais**
> desde o cutover de 2026-07-14 — ver `HANDOFF.md` da raiz do monorepo para a arquitetura completa.

- **Vercel**: **um único projeto (`neo-lm`)**, deploy da RAIZ do monorepo (`argo/`), não mais um projeto próprio `maturitymodel`. O MMA é servido em `https://neo-lm.vercel.app/maturity/**` (build Vite com `--base=/maturity/`, composto com o Hub e o Dash via `scripts/build-portal.mjs` na raiz). `vercel.json` da raiz define rewrites/headers para os três apps. CI de lint/typecheck/build por app: `.github/workflows/ci.yml` na raiz (novo, 2026-07-15) — ainda sem testes automatizados de RLS/E2E para o MMA especificamente (ver `docs/QA-PLAN.md` da raiz, item B4/B6).
- **Login**: não é mais email+senha próprio do MMA (§4.1 acima descreve o modelo antigo) — é sessão Supabase unificada, criada no Hub (`/`) via OTP, válida nas três apps por same-origin (`localStorage` compartilhado) + cookie `neo_session` (HMAC) exigido pelo `middleware.ts` da raiz para servir `/maturity/**`.
- **Supabase**: projeto `cvkcngrmnfwupstyrpsd` (inalterado), CLI linkado localmente. Migrations aplicadas via `supabase db push` ou Management API. Edge Function via `supabase functions deploy sync-anchors`. Secrets via `supabase secrets set`.
- **Locavia Dashboard (`locavia-dashboard/`)**: agora é **outra pasta do mesmo monorepo** (`argo/locavia-dashboard/`), não mais um projeto separado — servido em `/dash/**` do mesmo domínio `neo-lm.vercel.app`. O contrato de API (`/api/data`, `?embed=1`) segue igual, só a origem mudou (same-origin agora, sem cross-origin/postMessage).

## 11. Governança — como mexer aqui com segurança

1. **Nunca commitar segredos.** `.env` (chaves Supabase) já esteve versionado por engano antes desta sessão — foi removido do rastreamento (`git rm --cached`) e adicionado ao `.gitignore`, mas o histórico antigo do git ainda tem o valor. Rotacionar a anon key é uma opção se isso incomodar. **Cuidado com `git rm --cached` numa branch que depois vai ser mergeada**: se o arquivo ainda está rastreado no branch de destino (`main`) no momento do merge, a remoção vira uma deleção real — o `.env` sumiu de verdade do disco desta forma nesta sessão, e precisou ser recriado manualmente (`VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY`, a chave `anon` — pública por design, protegida pela RLS e não por sigilo, então recriá-la localmente não é sensível).
2. **`supabase config push` reescreve TODA a seção `[auth]`** (não é patch parcial) — sempre ler o diff mostrado antes de confirmar, e nunca declarar um campo sem saber o valor real de produção (senão ele volta pro default do CLI). Já causou um incidente antes desta sessão.
3. **Migrations novas precisam de timestamp real** (`YYYYMMDDHHMMSS_nome.sql`), maior que a última já aplicada — o CLI recusa inserir "no passado". Rode `supabase migration list` (leitura, seguro) antes de `db push` pra conferir a ordem.
4. **RLS que envolve `service_role` é bypass total** — qualquer `supabase db query --linked` roda com privilégio total, sem RLS. Use para leitura livremente; para escrita, pense se essa ação deveria passar pela RLS normal (via app) em vez de ser feita "por fora". O bootstrap do primeiro AM (§4.2) é o único caso onde isso é estritamente necessário.
5. **Serviço de email padrão do Supabase tem rate limit baixo** (poucos envios por hora). Para convidar muita gente de uma vez, configurar um provedor SMTP customizado em Authentication → Email Templates/SMTP Settings — do contrário, espaçar os convites.
6. **Branch de trabalho**: esta sessão usou `feat/mma-portal` até o merge final em `main` (squash não foi usado — histórico granular preservado de propósito). Para próximas mudanças grandes, o mesmo padrão (branch → testar → merge → push) é recomendado em vez de commitar direto em `main`, mesmo não havendo CI obrigatório.
7. **Antes de qualquer deploy**, rodar `npm run build` localmente — não há tsc no build (`vite build` só, igual ao app legado), então erros de tipo não bloqueiam; só erros de sintaxe/import. TypeScript incorreto pode passar despercebido até rodar em produção.
8. **Dados de teste**: ao testar fluxos ponta-a-ponta (voto→workshop→homologação→oficialização), crie squads com nome claramente marcado como teste (ex. prefixo/sufixo óbvio) e **apague antes de qualquer deploy real** — squads de teste já vazaram para a Torre/Comparativo de produção uma vez nesta sessão e precisaram ser limpos manualmente (delete em cascata manual: `votes→proposals→homologations→kaizens→anchor_readings→assessment_cycles→squad_members→teams`, nessa ordem, porque nem toda FK tem `on delete cascade`).
9. **Squad novo = sem AM automaticamente.** Ao criar um squad pela tela Admin, ninguém tem `am` nele até alguém (que já seja AM em outro squad) adicionar explicitamente. Não existe "AM global" no schema — é sempre uma linha `squad_members` por squad.
10. **`profiles.email` não sincroniza com `auth.users.email` em UPDATE.** Só existe trigger de sync no INSERT (`handle_new_user()`). Se o email de alguém for trocado via Admin API (`PUT /auth/v1/admin/users/{id}`), o login continua funcionando (usa `auth.users`), mas `profiles.email` fica com o valor antigo até um `update profiles set email=...` manual — e qualquer busca por email em `profiles` (ex.: "adicionar membro por email" no Admin) fica quebrada até corrigir. Aconteceu de verdade nesta sessão.
11. **Mantenha este arquivo e o `STATUS.md` atualizados** a cada mudança estrutural (nova tabela, rota, decisão de arquitetura). O objetivo é que qualquer pessoa (ou sessão de IA) consiga retomar o projeto lendo só estes dois arquivos, sem precisar re-explorar o código do zero.

## 12. Onde encontrar cada coisa (índice rápido)

| Preciso de... | Vai em... |
|---|---|
| Adicionar uma nova tela dentro de um squad | `src/pages/squad/`, registrar rota em `App.tsx`, adicionar aba em `SquadSubNav.tsx` |
| Mudar uma regra de acesso por papel | `src/hooks/useSquadRole.ts` (front) + policy correspondente na migration `20260710120200_mma_rls_policies.sql` (banco) |
| Adicionar uma dimensão/eixo/estágio novo | Nova migration aditiva — nunca editar `20260710120100_mma_seed_content.sql` depois de aplicada |
| Mudar um token de cor/tipografia | `src/index.css` (`:root`/`[data-theme="dark"]`) + `tailwind.config.ts` se for um novo slot |
| Adicionar/editar uma fórmula de âncora | `supabase/functions/sync-anchors/index.ts`, objeto `EXTRACTORS` — redeploy com `supabase functions deploy sync-anchors` |
| Ver o que uma tela lê/escreve no banco | `docs/03-front-end-spec.md` §4 (contratos originais) ou o hook usado na própria página |
| Entender uma decisão de produto (por que X é assim) | `docs/01-modelo-conteudo.md` (apêndice de decisões de design) |
