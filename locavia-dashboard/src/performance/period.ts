/**
 * A biblioteca ÚNICA de período. Snapshot, comparação com o período anterior e tendência
 * semanal usam daqui — não cada um a sua conta.
 *
 * O QUE ESTAVA ERRADO (§5.2 do review, com o mecanismo corrigido):
 *
 * O review disse que `computeTeamPerformance` "muta o fim recebido". Não muta: `parseDate`
 * devolve um `Date` novo, então o `setUTCHours` mexia numa cópia local. A sobreposição era
 * real, mas por outra causa — e a causa importa, porque define a correção:
 *
 *   1. `useTeamPerformance` montava os dois períodos assim:
 *        period         = { start: subDays(now, days),   end: now }
 *        previousPeriod = { start: subDays(now, days*2),  end: subDays(now, days) }
 *      ou seja, `previousPeriod.end === period.start` — o MESMO instante.
 *   2. `isInPeriod` era FECHADO nas duas pontas (`>= start && <= end`).
 *   3. E o fim era empurrado para 23:59:59.999 do dia.
 *
 * Juntos: tudo resolvido entre `subDays(now, days)` e o fim daquele dia contava nos DOIS
 * períodos. O delta "vs. período anterior" — que é o número que a home usa para dizer se o
 * time melhorou — vinha inflado nas duas pontas.
 *
 * A correção é intervalo SEMIABERTO `[start, end)`: o fim de um período é exatamente o começo
 * do próximo, e nenhum instante pertence a dois. É a mesma convenção que `trends.ts` já usava
 * para as semanas ("sem sobreposição entre semanas").
 */

export interface Period {
  /** Inclusivo. */
  start: string;
  /** EXCLUSIVO — `end` pertence ao período seguinte, não a este. */
  end: string;
}

/** Parse tolerante ao formato que o Jira devolve (`2026-07-23 10:00:00-0300`). */
export function parsePeriodDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const normalized = value.trim().replace(' ', 'T').replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Predicado de pertencimento: `[start, end)`.
 *
 * Antes era `date >= start && date <= end` (fechado), e o `end` de um período coincidia com o
 * `start` do outro — daí a contagem dupla.
 */
export function makeInPeriod(start: Date, end: Date): (date: Date | null) => boolean {
  return (date: Date | null) => date !== null && date >= start && date < end;
}

/**
 * O período ANTERIOR de mesma duração, colado no atual sem sobrepor.
 *
 * `previous.end === current.start` é CORRETO aqui justamente porque o intervalo é semiaberto:
 * aquele instante pertence só ao período atual.
 */
export function previousPeriodOf(period: Period): Period {
  const start = parsePeriodDate(period.start);
  const end = parsePeriodDate(period.end);
  if (!start || !end) throw new Error('Período inválido ao derivar o período anterior.');
  const durationMs = end.getTime() - start.getTime();
  return {
    start: new Date(start.getTime() - durationMs).toISOString(),
    end: period.start,
  };
}

/**
 * Fim do dia como limite EXCLUSIVO: 00:00:00.000 do dia seguinte, em UTC.
 *
 * O CLAUDE.md exige fechar o dia em UTC para não perder datas em fuso negativo. Com intervalo
 * semiaberto isso deixa de ser "23:59:59.999" (que perde o último milissegundo e ainda encosta
 * no período vizinho) e passa a ser a meia-noite seguinte — o mesmo instante, sem ambiguidade.
 */
export function endOfDayExclusiveUTC(date: Date): Date {
  const out = new Date(date);
  out.setUTCHours(0, 0, 0, 0);
  out.setUTCDate(out.getUTCDate() + 1);
  return out;
}
