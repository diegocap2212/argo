import type { DashboardItem } from '../src/types/jira';
import { isDiscardedStatus } from '../src/performance/discard';

/**
 * Contrato do DATASET, verificado antes de publicar no Blob.
 *
 * O que existia era um schema Zod de 8 campos com `.passthrough()`: garantia que cada item
 * tinha `Key` string e `StatusCategory` num dos três valores. Isso pega lixo estrutural — não
 * pega os erros que realmente machucam, porque eles são de CONJUNTO, não de item:
 *
 *   · o sync rodou com credencial errada e trouxe 12 itens em vez de 6.345;
 *   · um time desapareceu porque o campo Time mudou de nome no Jira;
 *   · a mesma Key veio duas vezes (paginação repetiu uma página);
 *   · `Resolved` anterior a `Created`;
 *   · um custom field foi renomeado e 100% dos itens perderam Release/Módulo.
 *
 * Cada um desses publica um dataset "válido" que descreve uma realidade falsa. O sync sobrescreve
 * o Blob, o dashboard mostra os números novos, e ninguém tem como saber — foi exatamente o modo
 * de falha do fallback de `Resolved`.
 *
 * A checagem é sobre o CONJUNTO e compara com o dataset ANTERIOR. Sem baseline, uma queda de
 * 90% no volume é indistinguível de um trimestre fraco.
 */

export interface ContractViolation {
  severidade: 'bloqueia' | 'alerta';
  regra: string;
  detalhe: string;
}

export interface DatasetBaseline {
  count: number;
  teams: string[];
}

/** Quanto o volume pode cair em relação ao último sync antes de virar suspeita. */
const QUEDA_MAXIMA_PCT = 30;
/** Piso absoluto: abaixo disso não é "trimestre fraco", é sync quebrado. */
const VOLUME_MINIMO = 500;
/** Teto de sanidade: acima disso o JQL provavelmente perdeu o filtro de time. */
const VOLUME_MAXIMO = 100_000;
/** % máximo de itens sem Release antes de suspeitar de custom field renomeado. */
const SEM_RELEASE_MAXIMO_PCT = 95;

export function checkDatasetContract(
  items: readonly DashboardItem[],
  baseline: DatasetBaseline | null,
): ContractViolation[] {
  const v: ContractViolation[] = [];
  const add = (severidade: ContractViolation['severidade'], regra: string, detalhe: string) =>
    v.push({ severidade, regra, detalhe });

  // ── Volume ────────────────────────────────────────────────────────────────
  if (items.length < VOLUME_MINIMO) {
    add('bloqueia', 'volume-minimo', `${items.length} itens (mínimo ${VOLUME_MINIMO}). Credencial ou JQL errado?`);
  }
  if (items.length > VOLUME_MAXIMO) {
    add('bloqueia', 'volume-maximo', `${items.length} itens (máximo ${VOLUME_MAXIMO}). O JQL perdeu o filtro?`);
  }
  if (baseline && baseline.count > 0) {
    const quedaPct = ((baseline.count - items.length) / baseline.count) * 100;
    if (quedaPct > QUEDA_MAXIMA_PCT) {
      add(
        'bloqueia',
        'queda-de-volume',
        `${items.length} itens vs ${baseline.count} no último sync (−${quedaPct.toFixed(1)}%). ` +
          `Dataset só encolhe assim se algo quebrou: itens não desaparecem do Jira.`,
      );
    }
  }

  // ── Unicidade de chave ────────────────────────────────────────────────────
  // Paginação que repete página duplica itens e DOBRA a vazão do time afetado.
  const vistos = new Set<string>();
  const duplicadas = new Set<string>();
  for (const item of items) {
    if (vistos.has(item.Key)) duplicadas.add(item.Key);
    vistos.add(item.Key);
  }
  if (duplicadas.size) {
    add(
      'bloqueia',
      'chave-duplicada',
      `${duplicadas.size} Key(s) repetida(s): ${[...duplicadas].slice(0, 5).join(', ')}. Paginação repetiu página?`,
    );
  }

  // ── Times ─────────────────────────────────────────────────────────────────
  const times = [...new Set(items.map((i) => i.Team.trim()).filter(Boolean))].sort();
  if (baseline) {
    const sumiram = baseline.teams.filter((t) => !times.includes(t));
    if (sumiram.length) {
      add(
        'bloqueia',
        'time-desaparecido',
        `Time(s) que existiam e não vieram: ${sumiram.join(', ')}. ` +
          `Campo Time renomeado no Jira, ou o mapa de TIME_FIELD_TO_TEAM ficou defasado.`,
      );
    }
    const novos = times.filter((t) => !baseline.teams.includes(t));
    if (novos.length) add('alerta', 'time-novo', `Time(s) novo(s): ${novos.join(', ')}. Confirmar se é esperado.`);
  }

  // ── Datas impossíveis ─────────────────────────────────────────────────────
  const agora = Date.now();
  let resolvidoAntesDeCriado = 0;
  let criadoNoFuturo = 0;
  let dataInvalida = 0;
  for (const item of items) {
    const criado = Date.parse(item.Created);
    if (!Number.isFinite(criado)) { dataInvalida++; continue; }
    // 24h de folga: fuso e relógio do Jira não são exatos.
    if (criado > agora + 86_400_000) criadoNoFuturo++;
    if (item.Resolved) {
      const resolvido = Date.parse(item.Resolved);
      if (!Number.isFinite(resolvido)) { dataInvalida++; continue; }
      if (resolvido < criado) resolvidoAntesDeCriado++;
    }
  }
  if (dataInvalida) add('bloqueia', 'data-invalida', `${dataInvalida} item(ns) com data não parseável.`);
  if (criadoNoFuturo) add('alerta', 'criado-no-futuro', `${criadoNoFuturo} item(ns) criados no futuro.`);
  if (resolvidoAntesDeCriado) {
    add(
      'alerta',
      'resolvido-antes-de-criado',
      `${resolvidoAntesDeCriado} item(ns) com Resolved < Created. ` +
        `Não bloqueia (é sujeira do Jira, não do sync) e já sai de LeadTime via DataQuality.negativeLeadTime.`,
    );
  }

  // ── Drift de custom field ─────────────────────────────────────────────────
  // Um campo renomeado no Jira não dá erro: o mapper lê `undefined` e cai no default. O
  // sintoma é 100% dos itens com o mesmo valor.
  if (items.length) {
    const semRelease = items.filter((i) => !i.Release || i.Release === 'OUTROS').length;
    const pct = (semRelease / items.length) * 100;
    if (pct > SEM_RELEASE_MAXIMO_PCT) {
      add(
        'bloqueia',
        'drift-release',
        `${pct.toFixed(1)}% dos itens sem Release (máximo ${SEM_RELEASE_MAXIMO_PCT}%). ` +
          'customfield_11330 renomeado ou fora da lista de fields da busca?',
      );
    }
    const semTime = items.filter((i) => !i.Team.trim() || i.Team.trim() === 'SEM TIME').length;
    const pctTime = (semTime / items.length) * 100;
    if (pctTime > 90) {
      add('bloqueia', 'drift-time', `${pctTime.toFixed(1)}% dos itens sem Time. customfield_11795 mudou?`);
    }
  }

  // ── Procedência do histórico ──────────────────────────────────────────────
  // `TimeInStatus` e `TimeInTodo` são reconstruídos transição por transição do changelog. Com
  // histórico parcial saem errados parecendo certos. Um item ou outro sem histórico completo é
  // tolerável; a MAIORIA significa que o bulkfetch falhou e o dataset inteiro carrega métrica
  // de etapa não confiável — aí vale mais alertar alto do que publicar em silêncio.
  if (items.length) {
    const parciais = items.filter((i) => !i.DataQuality?.historyComplete).length;
    const pct = (parciais / items.length) * 100;
    if (pct > 50) {
      add(
        'alerta',
        'historico-parcial',
        `${pct.toFixed(1)}% dos itens sem changelog completo. ` +
          `Cycle time por etapa e TimeInTodo ficam não confiáveis — o bulkfetch falhou? ` +
          `Alerta, não bloqueio: entrega e lead time (que vêm de resolutiondate) seguem válidos.`,
      );
    }
  }

  // ── Consistência interna ──────────────────────────────────────────────────
  // DONE sem resolutiondate é dívida de higiene LEGÍTIMA (a âncora do Maturity mede isso).
  // Só vira suspeita quando é a maioria: aí o campo resolutiondate parou de vir.
  const done = items.filter((i) => i.StatusCategory === 'DONE' && !isDiscardedStatus(i.Status));
  if (done.length > 50) {
    const semResolucao = done.filter((i) => !i.Resolved).length;
    const pct = (semResolucao / done.length) * 100;
    if (pct > 50) {
      add(
        'bloqueia',
        'resolutiondate-ausente-em-massa',
        `${pct.toFixed(1)}% dos DONE sem resolutiondate. O campo saiu da busca? ` +
          `(Alguns sem resolução é higiene do board; a maioria é o sync.)`,
      );
    }
  }

  return v;
}

/** Baseline a partir do dataset atual, para o próximo sync comparar. */
export function baselineFrom(items: readonly DashboardItem[]): DatasetBaseline {
  return {
    count: items.length,
    teams: [...new Set(items.map((i) => i.Team.trim()).filter(Boolean))].sort(),
  };
}
