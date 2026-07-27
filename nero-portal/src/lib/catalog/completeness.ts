import type { CatalogAsset, DataField } from "@prisma/client";

/**
 * "Definição de pronto" do Golden Example (kit 09, checklist final) — CALCULADA,
 * não armazenada (mesmo princípio do aging). 6 checks; % = concluídos/6.
 */

export type CompletenessCheck = { label: string; done: boolean };

export type Completeness = {
  checks: CompletenessCheck[];
  done: number;
  total: number;
  pct: number;
};

export function assetCompleteness(
  asset: CatalogAsset,
  campos: DataField[],
): Completeness {
  const has = (v: string | null | undefined) => Boolean(v && v.trim().length > 0);

  const checks: CompletenessCheck[] = [
    {
      label: "Entrada de catálogo completa (descrição, owner, grão, atualização)",
      done: has(asset.descricao) && has(asset.owner) && has(asset.grao) && has(asset.atualizacao),
    },
    {
      label: "Todos os campos com tipo e descrição no dicionário",
      done: campos.length > 0 && campos.every((c) => has(c.tipo) && has(c.descricao)),
    },
    {
      label: "Sensibilidade LGPD classificada (tabela e campos)",
      done: has(asset.sensibilidade) && campos.length > 0 && campos.every((c) => has(c.sensibilidade)),
    },
    {
      label: "Lineage mapeado (origem → destino)",
      done: has(asset.lineage),
    },
    {
      label: "Notas/regras de qualidade registradas",
      done: has(asset.notasQualidade),
    },
    {
      label: "Validado pelo owner (com data)",
      done: has(asset.validadoPor) && asset.validadoEm !== null,
    },
  ];

  const done = checks.filter((c) => c.done).length;
  return { checks, done, total: checks.length, pct: Math.round((done / checks.length) * 100) };
}
