/**
 * Sensibilidade LGPD (kit 06 §2.2) — labels e cores de badge compartilhadas
 * pelo catálogo (nível tabela e nível campo).
 */

export const SENSIBILIDADES = ["publico", "interno", "pessoal", "pessoal_sensivel"] as const;
export type Sensibilidade = (typeof SENSIBILIDADES)[number];

export const SENSIBILIDADE_LABEL: Record<Sensibilidade, string> = {
  publico: "Público",
  interno: "Interno",
  pessoal: "Pessoal (PII)",
  pessoal_sensivel: "Pessoal sensível",
};

export const SENSIBILIDADE_CLASS: Record<Sensibilidade, string> = {
  publico: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  interno: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  pessoal: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  pessoal_sensivel: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};

export function isSensibilidade(v: string): v is Sensibilidade {
  return (SENSIBILIDADES as readonly string[]).includes(v);
}
