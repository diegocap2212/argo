import { useEffect, useMemo, useState } from 'react';
import { subDays } from 'date-fns';
import { computeTeamPerformance } from '../performance/computeTeamPerformance';
import { generateTeamInsights } from '../performance/insights';
import { fetchData } from '../services/dataService';
import type { DashboardItem } from '../types/jira';
import { computeAgingDistribution, computeCumulativeFlow, computeWeeklyPerformanceTrend } from '../performance/trends';
import { computeAgingHeatmap, computeAttentionItems, computeLeadTimeScatter, computeStageDurations, computeThroughputVsLeadTime } from '../performance/analytics';
import { computeEpics } from '../performance/epics';
import { operationalItems, isOperationalType, isOutrosThroughputType, teamShowsOutrosNaVazao } from '../performance/operational';
import { endOfDayExclusiveUTC, previousPeriodOf } from '../performance/period';

export function useTeamPerformance(teamId: string, days = 56) {
  const [allItems, setAllItems] = useState<DashboardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now] = useState(() => new Date());

  useEffect(() => {
    let alive = true;
    fetchData()
      .then(data => { if (alive) setAllItems(data as unknown as DashboardItem[]); })
      .catch(reason => { if (alive) setError(reason instanceof Error ? reason.message : String(reason)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  // `items` = operacional (alimenta TODAS as métricas, como antes). O filtro saiu da
  // ingestão para `viewItems` poder incluir os "outros" só na vazão dos times opt-in.
  const items = useMemo(
    () => operationalItems(allItems).filter(item => item.Team.trim() === teamId),
    [allItems, teamId],
  );
  const outrosNaVazao = teamShowsOutrosNaVazao(teamId);
  // `viewItems` = base da "Vazão por tipo": para time opt-in, operacional + "outros" (exceto
  // Script Manual); senão, igual a `items`. NÃO alimenta snapshot/forecast/saúde.
  const viewItems = useMemo(
    () => outrosNaVazao
      ? allItems.filter(item => item.Team.trim() === teamId && (isOperationalType(item.Type) || isOutrosThroughputType(item.Type)))
      : items,
    [allItems, teamId, outrosNaVazao, items],
  );
  // `end` é EXCLUSIVO e cobre o dia corrente inteiro: meia-noite UTC do dia seguinte. É aqui
  // que a decisão vive — o cálculo não estica mais o limite por conta própria (era o que
  // gerava a contagem dupla no dia da fronteira). Fechamento em UTC por exigência do
  // CLAUDE.md: em fuso negativo, fechar em hora local perderia o último dia.
  const period = useMemo(
    () => ({
      start: subDays(now, days).toISOString(),
      end: endOfDayExclusiveUTC(now).toISOString(),
    }),
    [now, days],
  );
  // Derivado por `previousPeriodOf` em vez de montado à mão. O par montado aqui fazia
  // `previousPeriod.end === period.start` e, com o `isInPeriod` FECHADO de antes, o dia da
  // fronteira contava nos dois períodos — inflando exatamente o delta que a tela usa para
  // dizer se o time melhorou. Agora o intervalo é semiaberto e a derivação é única.
  const previousPeriod = useMemo(() => previousPeriodOf(period), [period]);
  const snapshot = useMemo(() => computeTeamPerformance(items, { teamId, period, now }), [items, teamId, period, now]);
  const previousSnapshot = useMemo(() => computeTeamPerformance(items, { teamId, period: previousPeriod, now }), [items, teamId, previousPeriod, now]);
  const insights = useMemo(() => generateTeamInsights(snapshot, previousSnapshot), [snapshot, previousSnapshot]);

  const trend = useMemo(() => computeWeeklyPerformanceTrend(items, period), [items, period]);
  // Série só para a "Vazão por tipo": inclui os "outros" rotulados quando o time é opt-in.
  const viewTrend = useMemo(
    () => computeWeeklyPerformanceTrend(viewItems, period, { labelOutros: outrosNaVazao }),
    [viewItems, period, outrosNaVazao],
  );
  const cfd = useMemo(() => computeCumulativeFlow(items, period), [items, period]);
  const aging = useMemo(() => computeAgingDistribution(items, now), [items, now]);
  const analysis = useMemo(() => ({
    scatter: computeLeadTimeScatter(items, period),
    throughputVsLead: computeThroughputVsLeadTime(trend),
    stages: computeStageDurations(items, period),
    heatmap: computeAgingHeatmap(items, [teamId], now),
    attention: computeAttentionItems(items, now, 8),
  }), [items, period, trend, teamId, now]);

  /**
   * Épicos usam o HISTÓRICO COMPLETO do time, de propósito — não o `period` selecionado.
   *
   * Recortar os filhos pela janela seria pior que a inconsistência que isso aparenta: a
   * completude de um épico é cumulativa, então um épico com 40 itens exibiria "2 de 3
   * concluídos" quando só 3 tiveram atividade nos últimos 30 dias. O número ficaria
   * tecnicamente coerente com o filtro e completamente errado como informação.
   *
   * O problema real que o review apontou (§5.5) é de COMUNICAÇÃO: a tela sugeria que todo
   * número respondia ao filtro temporal. Resolvido no componente, que agora rotula o painel
   * como histórico completo. Ver EpicsCharts.
   */
  const epics = useMemo(() => computeEpics(items, now), [items, now]);

  return { items, period, snapshot, previousSnapshot, insights, trend, viewTrend, outrosNaVazao, cfd, aging, analysis, epics, loading, error };
}
