// ============================================================================
// src/types/mma.ts · Tipos do domínio (espelham o schema de 001_schema.sql)
// ============================================================================

export type AxisKey = "processo" | "produto" | "time";

/**
 * Papel DENTRO de um squad (`squad_members.role`). Só dois valores desde 2026-07-26:
 * `po`/`tl`/`team` foram colapsados em `member` porque não tinham nenhuma consequência
 * funcional (o voto individual morreu na sessão colaborativa e a sessão é gravada só
 * pelo facilitador), e `am` virou papel GLOBAL do portal — ver `PortalRole`.
 */
export type Role = "sm" | "member";

/**
 * Papel GLOBAL no portal (`portal_roles.role`), concedido por e-mail pelo admin.
 * `admin` faz tudo; `am` vê todos os squads e homologa, mas não reseta, não exclui
 * e não gerencia membros. É o que resolve "não vejo o que preciso homologar".
 */
export type PortalRole = "admin" | "am";

export type CycleStatus =
  | "pre_session"   // SM prepara a análise prévia (nota provisória + argumento) antes da sessão
  | "session"       // sessão colaborativa: SM apresenta e registra a nota de consenso por dimensão
  | "homologation"  // pacote na fila do AM
  | "official"      // homologado — imutável, gera kaizens e marco no comparativo
  | "archived";

export type Verdict = "sustains" | "conflicts" | "limit" | "na";
export type KaizenStatus = "backlog" | "doing" | "done" | "dropped";

export interface Axis {
  id: string;
  key: AxisKey;
  name: string;
  owner_role: "sm" | "po" | "all";
  display_order: number;
}

export interface Stage {
  number: 1 | 2 | 3 | 4;
  name: string;         // "Confronto e Estruturação"
  legacy_name: string;  // "Visível"
  tuckman: string;      // "Storming"
  description: string;  // caracterização do time (andar de cima)
}

export interface Dimension {
  id: string;
  axis_id: string;
  key: string;
  name: string;
  description: string;
  narrative: string | null;
  /** Conteúdo do MODELO (quem é dono da dimensão: 'sm', 'po', 'tl'…), não permissão. */
  owner_roles: string[];
  display_order: number;
}

export interface DimensionStageDescription {
  id: string;
  dimension_id: string;
  stage_number: 1 | 2 | 3 | 4;
  description: string;   // texto rico (camada de referência)
  short_text: string;    // frase de reconhecimento (tela de voto)
  example: string | null;
  kaizen_hint: string | null;
  anchor_note: string | null;
}

export interface Anchor {
  id: string;
  dimension_id: string;
  name: string;
  metric_key: string;
  unit: string | null;
  comparator: "<=" | ">=" | "between";
  stage_targets: Record<string, number>;
  active: boolean;
}

export interface Team {
  id: string;
  name: string;
  tower: string;
  locavia_team_key: string | null;
  status: "active" | "forming" | "faseout";
}

export interface SquadMember {
  team_id: string;
  user_id: string;
  role: Role;
}

export interface AssessmentCycle {
  id: string;
  team_id: string;
  quarter: string; // "2026Q3"
  status: CycleStatus;
  workshop_at: string | null;
  officialized_at: string | null;
  homologated_by: string | null;
  previous_cycle_id: string | null;
  migrated_scale: boolean;
}

export interface Proposal {
  cycle_id: string;
  dimension_id: string;
  stage: number; // decimal (2.5)
  decided_by: "consensus" | "sm_final";
  divergence: boolean;
  notes: string | null;
}

export interface Homologation {
  cycle_id: string;
  dimension_id: string;
  official_stage: number;
  adjusted: boolean;
  justification: string | null;
  am_user_id: string;
  anchors_snapshot: AnchorReading[] | null;
}

export interface AnchorReading {
  id: string;
  team_id: string;
  anchor_id: string;
  cycle_id: string | null;
  value: number | null;
  verdict: Verdict;
  read_at: string;
}

export interface Kaizen {
  id: string;
  team_id: string;
  cycle_id: string | null;
  dimension_id: string | null;
  title: string;
  from_stage: number | null;
  to_stage: number | null;
  owner_id: string | null;
  status: KaizenStatus;
  anchor_id: string | null;
  baseline_value: number | null;
  target_value: number | null;
  result_value: number | null;
  due_date: string | null;
  source: "model" | "custom";
}

// Views
export interface CycleScore {
  cycle_id: string;
  team_id: string;
  quarter: string;
  migrated_scale: boolean;
  dimension_id: string;
  dim_key: string;
  dim_name: string;
  axis_key: AxisKey;
  official_stage: number;
}

export interface QuarterComparisonRow extends Omit<CycleScore, "cycle_id" | "dimension_id"> {
  prev_stage: number | null;
}

// Máquina de estados do ciclo (transições válidas)
//
// Espelhada NO BANCO pelo trigger `cycle_transition_guard` (migration 20260726120000),
// que também define QUEM pode fazer cada transição. Mudar este mapa sem mudar o trigger
// deixa a UI oferecendo um caminho que o banco recusa — e vice-versa.
export const CYCLE_TRANSITIONS: Record<CycleStatus, CycleStatus[]> = {
  pre_session:  ["session"],               // SM fecha as 10 pré-avaliações e inicia a sessão
  session:      ["homologation"],          // SM fecha as 10 notas de consenso e envia
  homologation: ["official", "session"],   // session: AM devolve pra sessão com comentários
  official:     ["archived"],              // via RPC officialize_cycle apenas
  archived:     [],
};

/**
 * A jornada como o usuário a lê, na ordem. Vive aqui — e não na home — porque um passo
 * ausente aqui não é cosmético: `findIndex` devolve -1 e a etapa exibida fica ERRADA.
 * Foi o que aconteceu com `pre_session`, que existia no banco desde 24/07 mas não nesta
 * lista, então um ciclo em pré-sessão aparecia como "Sessão" na home.
 *
 * Invariante: todo `CycleStatus` aparece em exatamente um passo. O `satisfies` abaixo não
 * garante isso sozinho, então o teste da matriz confere a cobertura.
 */
export const CYCLE_JOURNEY = [
  { label: "Pré-sessão",  status: "pre_session",  detail: "Análise prévia do SM" },
  { label: "Sessão",      status: "session",      detail: "Discussão colaborativa" },
  { label: "Homologação", status: "homologation", detail: "Revisão do AM" },
  { label: "Plano",       status: "official",     detail: "Kaizens priorizados" },
  { label: "Evolução",    status: "archived",     detail: "Resultado do ciclo" },
] as const satisfies ReadonlyArray<{ label: string; status: CycleStatus; detail: string }>;

/** Ordem canônica dos estados. Derivada da jornada para as duas não poderem divergir. */
export const CYCLE_ORDER: readonly CycleStatus[] = CYCLE_JOURNEY.map((s) => s.status);

/** Índice do passo na jornada. -1 nunca escapa: status desconhecido cai no primeiro passo. */
export function journeyStepOf(status: CycleStatus | null | undefined): number {
  if (!status) return 0;
  const i = CYCLE_JOURNEY.findIndex((s) => s.status === status);
  return i === -1 ? 0 : i;
}

/**
 * Rota do squad onde a etapa é executada. Único mapa status → tela: a home, a sub-nav e
 * a trilha do ciclo apontavam para caminhos calculados em três lugares diferentes.
 * `null` (squad sem ciclo) cai na Jornada, que é onde se inicia o assessment.
 */
export function squadRouteFor(teamId: string, status: CycleStatus | null | undefined): string {
  switch (status) {
    case "pre_session":
    case "session":
      return `/s/${teamId}/sessao`;
    case "homologation":
      return `/s/${teamId}/homologacao`;
    case "official":
    case "archived":
      return `/s/${teamId}/plano`;
    default:
      return `/s/${teamId}`;
  }
}
