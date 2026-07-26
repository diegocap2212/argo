/**
 * Aging das dependências do LM — CALCULADO, não armazenado (kit 07 §4).
 * Conta dias úteis (exclui sábado/domingo) entre a data do pedido e hoje.
 * Regra do kit: aging > 5 dias úteis → vermelho; tolerância de espera = 1 dia.
 */

export type AgingNivel = "ok" | "atencao" | "vermelho";

export function businessDaysBetween(from: Date, to: Date): number {
  if (to <= from) return 0;
  let count = 0;
  const cursor = new Date(from);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);
  while (cursor < end) {
    cursor.setDate(cursor.getDate() + 1);
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count++;
  }
  return count;
}

export function agingDias(solicitadoEm: Date | null, now: Date = new Date()): number | null {
  if (!solicitadoEm) return null;
  return businessDaysBetween(new Date(solicitadoEm), now);
}

export function agingNivel(dias: number | null): AgingNivel {
  if (dias === null) return "ok";
  if (dias >= 5) return "vermelho";
  if (dias >= 2) return "atencao";
  return "ok";
}
