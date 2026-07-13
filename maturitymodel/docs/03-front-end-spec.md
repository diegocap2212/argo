# Portal MMA · Spec de Front-end v1
## Rotas, telas, contratos de dados e critérios de aceite

Stack: Vite + React + TS + shadcn/ui (existente) · Vercel · supabase-js v2.
Referência visual navegável: `prototype/mma-prototipo-v2.html` (abrir no navegador).
Tipos do domínio: `src/types/mma.ts`.

---

## 1. Design system

Adotar o **DS do Locavia Dashboard** (tokens extraídos do CSS de produção):

| Token | Light | Dark |
|---|---|---|
| `--accent` | `#2be86b` | `#2be86b` |
| `--accent-strong` | `#138a3f` | `#6cf09a` |
| `--accent-soft` / fg | `#d8fbe2` / `#11602c` | `#2be86b29` / `#8ff3b0` |
| `--surface` / 2 / 3 | `#fff` / `#f4f8f5` / `#e9efea` | `#101813` / `#171d17` / `#202820` |
| `--page` | `#f4f8f5` | `#072011` |
| `--shell-bg` (sidebar/header) | `#fff` | `#0b140d` |
| `--text-primary/secondary/tertiary` | `#0b140d` / `#4c5a4f` / `#82928a` | `#f2f7f3` / `#f2f7f3b8` / `#f2f7f37a` |
| `--border-subtle/default/strong` | `#e5ece7` / `#d3ddd6` / `#b3c0b7` | `#1e261e` / `#2b352b` / `#3e4a3e` |
| ok / warn / err | `#2be86b` / `#e8a317` / `#e5484d` | idem (bg com alpha) |
| radius md/lg/xl | 12 / 16 / 24 px | |

**Tipografia:** Inter (corpo, UI) + **Newsreader** serif em títulos de página, números grandes (nível 2.6) e o `hnum` da homologação — é a assinatura do Locavia. Botão primário preto (`#090909`) no light / branco no dark; accent verde reservado a ações de avanço do ciclo (Confirmar voto, Oficializar).
**Logo:** `venice-by-blite.svg` (público no Locavia), fill controlado por `--logo-fill` para trocar com o tema.
**Temas:** light default + dark via `data-theme="dark"` (toggle na sidebar, persistir em localStorage — chave `venice-theme`, mesma do Locavia).

---

## 2. Arquitetura de informação

**Contexto de squad NÃO mora na navegação global.**

- **Header:** `SquadSwitcher` (dropdown) com squad ativo + badge de pendência por squad ("Esteira · votação aberta"). Persistir seleção na URL (`/s/:teamId/...`) — deep-link é requisito (apresentações). À direita: pills dos 3 eixos do squad ativo (Processo · Produto · Time, de `v_axis_scores` do último ciclo oficial) + botão "Apresentar".
- **Sidebar (global, fixa):** Início · Torre · Guia do modelo · Administração (só AM) · toggle de tema.
- **Seções do squad ativo** (sub-navegação dentro de `/s/:teamId`): Jornada · Minha avaliação · Workshop · Homologação · Plano · Métricas · Comparativo. Visibilidade por papel (tabela na seção 4).

## 3. Rotas

| Rota | Tela | Acesso |
|---|---|---|
| `/login` | Auth (Supabase) | público |
| `/` | Início (pendências do usuário) | autenticado |
| `/torre` | Torre: grid de squads + scatter tese | autenticado |
| `/s/:teamId` | Jornada do ciclo (hub) | membro ou AM |
| `/s/:teamId/avaliar` | Minha avaliação (votação individual) | membro (não AM) |
| `/s/:teamId/workshop` | Workshop (facilitação da revelação) | SM do squad |
| `/s/:teamId/homologacao` | Homologação | AM |
| `/s/:teamId/plano` | Kanban de kaizens | membro ou AM |
| `/s/:teamId/metricas` | Âncoras de dados | membro ou AM |
| `/s/:teamId/comparativo` | Comparativo Q×Q | membro ou AM |
| `/s/:teamId/apresentar` | Modo apresentação | membro ou AM |
| `/guia` | Guia do modelo (conteúdo completo; absorve iceberg/vector/tutorial) | autenticado |
| `/admin` | Gestão de squads, membros, ciclos, conteúdo | AM |

Rotas legadas → redirects: `/welcome→/`, `/dashboard→/torre`, `/guide|/iceberg|/vector|/tutorial→/guia`.

---

## 4. Telas — contrato de dados e critérios de aceite

### 4.1 Início (`/`)
**Dados:** `squad_members` do usuário → para cada squad: ciclo corrente (`assessment_cycles` do quarter atual), pendência derivada:
- ciclo `voting` e usuário sem 10 `votes` → "Votação aberta (X de 10)"
- ciclo `homologation` e usuário é AM → "Homologar (N de 10 revisadas)"
- ciclo `official` e kaizens `backlog` sem dono → "Plano aguardando donos"

**Aceite:**
- [ ] Saudação + contagem de pendências; cada pendência tem CTA que leva direto à tela/ação.
- [ ] Lista "Seus squads" com nível oficial mais recente (serif) e status do ciclo.
- [ ] Calendário do quarter (janela de workshops da torre).
- [ ] Zero pendências → estado vazio convida a ver o Comparativo do squad principal.

### 4.2 Torre (`/torre`)
**Dados:** todos os teams visíveis + `v_axis_scores`/`v_cycle_scores` do último quarter + delta vs anterior (`v_quarter_comparison`).
**Aceite:**
- [ ] Card por squad: nível médio (serif), nome do estágio, delta vs quarter anterior, status do ciclo, mini-barra de 4 estágios.
- [ ] Scatter "nível MMA × aderência" (aderência de `anchor_readings` metric `flow.adherence_pct` mais recente por squad). Ponto destoante (nível alto + aderência baixa) em warn.
- [ ] Ciclos `migrated_scale` exibem marcador "escala convertida".

### 4.3 Minha avaliação (`/s/:teamId/avaliar`)
**Dados:** dimensões + `dimension_stage_descriptions.short_text` (4 por dimensão); `votes` do usuário no ciclo (retomada de onde parou).
**Fluxo:** wizard 1 dimensão por tela → 4 cards de estágio (short_text) → "Confirmar e avançar" grava `votes` (upsert). "Ver descrição completa" abre drawer com `description` + `example` + `kaizen_hint` (camada de referência, opt-in).
**Aceite:**
- [ ] Barra de progresso X/10; retomável; funciona em viewport mobile (workshop usa celular).
- [ ] Aviso fixo de sigilo: "Seu voto é individual e sigiloso até a revelação no workshop."
- [ ] Bloquear se ciclo ≠ `voting` (mensagem com status atual).
- [ ] AM não vota (rota oculta para papel `am` no squad).

### 4.4 Workshop (`/s/:teamId/workshop`) — visão do facilitador (SM)
**Dados:** por dimensão: `votes` agregados por `role_at_vote` (mediana do team; voto único de po/tl/sm) — a RLS só libera após `status ≠ voting`, então o botão "Iniciar revelação" transiciona o ciclo `voting → workshop`; leituras de âncora (`anchor_readings` com `cycle_id`), acionando `sync-anchors` sob demanda.
**Fluxo por dimensão:** (1) placar de votos revelados; (2) alerta se gap ≥ 2 entre qualquer perspectiva e outra; (3) painel de âncoras (sustenta/limite/conflita); (4) "Fechar nota proposta" grava `proposals` (stage decimal, `decided_by`, `divergence`).
**Aceite:**
- [ ] Revelação simultânea (nunca mostrar votos parciais durante `voting`).
- [ ] Progresso 10 pontos; dimensões puláveis e retomáveis.
- [ ] Ao fechar a 10ª: transição `workshop → proposed → homologation` + notificação ao AM (pendência no Início).

### 4.5 Homologação (`/s/:teamId/homologacao`) — AM
**Dados:** `proposals` + votos por perspectiva + `anchor_readings` do ciclo.
**Fluxo:** lista das 10 dimensões. Sem divergência e âncoras ok → "Homologar N" (1 clique, grava `homologations`). Flagada → expande com votos, âncoras e textarea; "Ajustar" exige `justification` (constraint no banco). Botão final "Oficializar assessment" chama `rpc('officialize_cycle')`.
**Aceite:**
- [ ] Contador "X de 10 revisadas"; Oficializar desabilitado até 10/10.
- [ ] Oficializar mostra o efeito: "libera o Plano e registra o marco QN no comparativo".
- [ ] "Devolver com comentários" → `homologation → proposed` + nota ao SM.
- [ ] Pós-oficialização: tela vira somente leitura com resumo dos ajustes do AM.

### 4.6 Plano (`/s/:teamId/plano`)
**Dados:** `kaizens` do squad (o RPC de oficialização pré-popula os `source='model'`).
**Aceite:**
- [ ] Kanban backlog/doing/done; card mostra dimensão, transição (2→3), dono, prazo, baseline→alvo da âncora.
- [ ] Mover para `done` solicita `result_value` (impacto medido); exibir "impacto: X→Y".
- [ ] "+ Kaizen" cria `source='custom'`.

### 4.7 Métricas (`/s/:teamId/metricas`)
**Dados:** `anchors` × última `anchor_reading` por âncora + estágio oficial da dimensão.
**Aceite:**
- [ ] Tabela dimensão → âncora → valor (mono) → veredito (tag ok/warn/err/na).
- [ ] Timestamp do último sync + botão "Sincronizar agora" (invoca `sync-anchors` com team_id) + link "Abrir Locavia ↗".
- [ ] Nota fixa: âncoras medem o sistema de trabalho, nunca pessoas.

### 4.8 Comparativo (`/s/:teamId/comparativo`)
**Dados:** `v_quarter_comparison` do squad.
**Aceite:**
- [ ] Chips de quarter (multi-select, máx. 3 sobrepostos no radar; mais recente no accent).
- [ ] Tabela de deltas por dimensão com sparkline (histórico de quarters) e ▲/=/▼.
- [ ] Gráfico "nível médio × aderência" com linhas verticais nos marcos de oficialização.
- [ ] Quarters `migrated_scale` com marcador "escala convertida" no chip e tooltip.
- [ ] Dimensões sem histórico (Validação de Épicos, Comunicação de Valor pré-migração) exibem "não medido" — nunca zero.

### 4.9 Modo apresentação (`/s/:teamId/apresentar`)
Sequência fullscreen navegável por setas: (1) contexto do squad · (2) radar atual vs anterior · (3) 3 destaques (maiores deltas) · (4) divergências resolvidas · (5) top 3 kaizens com métrica-alvo · (6) comparativo Q×Q. Reusa os mesmos componentes das telas em modo leitura.
**Aceite:** [ ] Navegação por teclado; [ ] sem nenhuma ação de escrita; [ ] deep-linkável.

### 4.10 Guia (`/guia`)
Conteúdo de `stages`, `axes`, `dimensions`, `dimension_stage_descriptions` renderizado como referência navegável (a "camada de referência" completa). Absorve o antigo iceberg/vector/tutorial como seções.

---

## 5. Componentes-chave (inventário)

`SquadSwitcher` (header) · `CycleJourney` (stepper 5 estações, estado por `cycle.status`) · `StageOptionCard` (voto) · `VoteRevealGrid` · `AnchorPanel` · `HomologationRow` · `RadarChart` (SVG próprio, séries sobrepostas — ver protótipo) · `QuarterChips` · `DeltaTable` + `Sparkline` · `KaizenCard` · `AxisPills` · `PresentationShell`.

Mapa jornada ↔ status: Avaliar=`voting` · Resultado/Workshop=`workshop|proposed` · Homologação=`homologation` · Plano/Evolução=`official`.

## 6. Regras transversais

1. **Sigilo do voto é do banco** (RLS), mas o front nunca deve nem tentar buscar votos alheios durante `voting`.
2. **Toda mutação de status** passa pela máquina `CYCLE_TRANSITIONS` (types) — UI não oferece transição inválida.
3. **`official` é imutável** na UI: sem edição de homologação/proposta após oficializar.
4. **Realtime opcional (v1.1):** canal Supabase em `votes` (count por dimensão) para o SM ver "7 de 8 votaram" sem ver os votos.
5. Textos de UI em pt-BR, sentence case, sem exclamações.
