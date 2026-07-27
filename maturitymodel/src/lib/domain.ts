import type { AxisKey } from "@/types/mma";
import { devWarn } from "@/lib/utils";

/**
 * Narrowing da FRONTEIRA de leitura do banco.
 *
 * POR QUE EXISTE: os tipos gerados do Supabase devolvem `axes.key` como `string` e
 * `stage_number` como `number`, porque é isso que as colunas são. Já `src/types/mma.ts`
 * declara `AxisKey = "processo" | "produto" | "time"` e estágio `1 | 2 | 3 | 4`.
 *
 * A saída fácil seria `as AxisKey` nos hooks. Isso não converte nada em runtime: só faz o
 * compilador parar de reclamar. Um valor novo em `axes.key` atravessaria o app inteiro
 * tipado como válido e quebraria numa tela, longe da origem.
 *
 * A garantia principal agora é do banco (migration 20260727140000 pôs CHECK em `axes.key`,
 * `stages.number` e `dimension_stage_descriptions.stage_number`). Estas funções são a
 * segunda linha: se algo escapar — migration revertida à mão, view nova, dado legado — a
 * linha é DESCARTADA com aviso, em vez de virar estado inválido silencioso.
 */

const AXIS_KEYS = ["processo", "produto", "time"] as const;
const STAGES = [1, 2, 3, 4] as const;

export type StageNumber = (typeof STAGES)[number];

export function isAxisKey(value: unknown): value is AxisKey {
  return typeof value === "string" && (AXIS_KEYS as readonly string[]).includes(value);
}

export function isStageNumber(value: unknown): value is StageNumber {
  return typeof value === "number" && (STAGES as readonly number[]).includes(value);
}

/**
 * Mantém só as linhas cujo `axis_key` está no domínio. Fora dele → descarta e avisa.
 * `context` entra no aviso para o log dizer QUAL consulta trouxe lixo.
 */
export function keepValidAxisKeys<T extends { axis_key: string }>(
  rows: readonly T[],
  context: string,
): Array<Omit<T, "axis_key"> & { axis_key: AxisKey }> {
  const out: Array<Omit<T, "axis_key"> & { axis_key: AxisKey }> = [];
  for (const row of rows) {
    if (isAxisKey(row.axis_key)) {
      out.push(row as Omit<T, "axis_key"> & { axis_key: AxisKey });
    } else {
      devWarn(`${context}: axis_key fora do domínio, linha descartada`, row.axis_key);
    }
  }
  return out;
}

/** Idem para `stage_number`. */
export function keepValidStageNumbers<T extends { stage_number: number }>(
  rows: readonly T[],
  context: string,
): Array<Omit<T, "stage_number"> & { stage_number: StageNumber }> {
  const out: Array<Omit<T, "stage_number"> & { stage_number: StageNumber }> = [];
  for (const row of rows) {
    if (isStageNumber(row.stage_number)) {
      out.push(row as Omit<T, "stage_number"> & { stage_number: StageNumber });
    } else {
      devWarn(`${context}: stage_number fora do domínio, linha descartada`, row.stage_number);
    }
  }
  return out;
}

/** Idem para `key` (tabela `axes`, onde a coluna se chama `key` e não `axis_key`). */
export function keepValidAxisRows<T extends { key: string }>(
  rows: readonly T[],
  context: string,
): Array<Omit<T, "key"> & { key: AxisKey }> {
  const out: Array<Omit<T, "key"> & { key: AxisKey }> = [];
  for (const row of rows) {
    if (isAxisKey(row.key)) {
      out.push(row as Omit<T, "key"> & { key: AxisKey });
    } else {
      devWarn(`${context}: axes.key fora do domínio, linha descartada`, row.key);
    }
  }
  return out;
}
