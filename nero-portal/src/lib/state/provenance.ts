/**
 * Status de verdade (teoria × realidade) — cidadão de primeira classe do portal.
 * O DAMA/Golden Example são teoria/template; a realidade do LM só se confirma no
 * discovery. Todo fato estruturado carrega um destes status + proveniência.
 */

export const STATUS_VERDADE = ["template", "assumido", "confirmado", "lacuna"] as const;
export type StatusVerdade = (typeof STATUS_VERDADE)[number];

export const STATUS_VERDADE_LABEL: Record<StatusVerdade, string> = {
  template: "Teoria/template",
  assumido: "Assumido",
  confirmado: "Confirmado",
  lacuna: "Lacuna",
};

// Classe de cor (Tailwind) por status, para badges no dashboard.
export const STATUS_VERDADE_CLASS: Record<StatusVerdade, string> = {
  template: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  assumido: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  confirmado: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  lacuna: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};

export function isStatusVerdade(v: string): v is StatusVerdade {
  return (STATUS_VERDADE as readonly string[]).includes(v);
}
