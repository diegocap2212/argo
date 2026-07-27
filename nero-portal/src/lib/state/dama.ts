/**
 * Roda DAMA (kit 08 §1) e modelo de maturidade de 5 níveis (kit 08 §5).
 * Nomes das áreas EXATAMENTE como no kit — são a chave única de
 * MaturityAssessment e o enum da tool avaliar_maturidade.
 */

export const DAMA_AREAS = [
  "Data Governance",
  "Data Architecture",
  "Data Modeling & Design",
  "Data Storage & Operations",
  "Data Security",
  "Data Integration & Interoperability",
  "Document & Content Management",
  "Reference & Master Data",
  "Data Warehousing & BI",
  "Metadata",
  "Data Quality",
] as const;

export type DamaArea = (typeof DAMA_AREAS)[number];

export function isDamaArea(v: string): v is DamaArea {
  return (DAMA_AREAS as readonly string[]).includes(v);
}

// Labels curtos para eixos do radar (11 eixos não comportam nomes longos).
export const DAMA_AREA_SHORT: Record<DamaArea, string> = {
  "Data Governance": "Governance",
  "Data Architecture": "Architecture",
  "Data Modeling & Design": "Modeling",
  "Data Storage & Operations": "Storage & Ops",
  "Data Security": "Security",
  "Data Integration & Interoperability": "Integration",
  "Document & Content Management": "Doc & Content",
  "Reference & Master Data": "Master Data",
  "Data Warehousing & BI": "DW & BI",
  "Metadata": "Metadata",
  "Data Quality": "Quality",
};

export const NIVEIS_MATURIDADE: Record<number, string> = {
  1: "Inicial",
  2: "Gerenciado",
  3: "Definido",
  4: "Medido",
  5: "Otimizado",
};

export function isNivelMaturidade(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && n <= 5;
}
