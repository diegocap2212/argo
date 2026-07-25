// ============================================================================
// src/types/mma.ts · Tipos do domínio (espelham o schema de 001_schema.sql)
// ============================================================================

export type AxisKey = "processo" | "produto" | "time";
export type Role = "team" | "po" | "tl" | "sm" | "am";

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
  owner_roles: Role[];
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
export const CYCLE_TRANSITIONS: Record<CycleStatus, CycleStatus[]> = {
  pre_session:  ["session"],               // SM fecha as 10 pré-avaliações e inicia a sessão
  session:      ["homologation"],          // SM fecha as 10 notas de consenso e envia
  homologation: ["official", "session"],   // session: AM devolve pra sessão com comentários
  official:     ["archived"],              // via RPC officialize_cycle apenas
  archived:     [],
};
