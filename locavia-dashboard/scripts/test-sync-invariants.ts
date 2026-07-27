/**
 * Invariantes do SYNC — a fronteira onde o dado do Jira vira dado do produto.
 * `pnpm --filter locavia-dashboard test:sync`
 *
 * POR QUE ESTE ARQUIVO EXISTE: o `metrics-calculator.ts` tinha um fallback
 * `Resolved = UpdatedAt` para item DONE sem `resolutiondate`. Ele violava a invariante
 * declarada no CLAUDE.md ("Resolved vem diretamente de resolutiondate do Jira") e, pior,
 * rodava ANTES do cálculo de `DataQuality.missingResolutionDate` — então a flag de higiene
 * que deveria denunciar o problema era `false` em 6.345 de 6.345 itens do dataset de
 * 2026-07-27. Um fallback que apaga o próprio alarme não aparece em teste de snapshot:
 * tudo continua "passando" enquanto a data de entrega é inventada.
 *
 * Convenção do repo: script tsx com assert, igual a scripts/test-performance.ts.
 */
import assert from 'node:assert/strict';
import { calculateMetrics } from '../sync/metrics-calculator';
import { computeWeeklyPerformanceTrend } from '../src/performance/trends';
import { computeTeamPerformance } from '../src/performance/computeTeamPerformance';
import { previousPeriodOf } from '../src/performance/period';
import { forecastHowMany, forecastWhen, remainingBacklog } from '../src/performance/montecarlo';
import { isDiscardedStatus } from '../src/performance/discard';
import { computeEpics } from '../src/performance/epics';
import { baselineFrom, checkDatasetContract, type DatasetBaseline } from '../sync/dataset-contract';
import type { DashboardItem, JiraApiIssue, StatusTransition } from '../src/types/jira';

let checks = 0;
function check(name: string, fn: () => void) {
  fn();
  checks++;
  console.log(`  ✓ ${name}`);
}

/** Item cru mínimo, no formato que o field-mapper entrega ao calculateMetrics. */
function baseItem(overrides: Partial<DashboardItem> = {}): DashboardItem {
  return {
    Type: 'Story', Key: 'TEAM-1', Summary: 'Item', Status: 'CONCLUÍDO',
    StatusCategory: 'DONE', Team: 'TEAM', Created: '2026-06-01T00:00:00Z',
    Resolved: null, UpdatedAt: '2026-06-20T00:00:00Z', Release: 'LEGACY',
    StoryPoints: null, Priority: 'Medium', Assignee: null, Labels: [],
    CommitmentDate: null, StartDate: null, FuraFila: [], NaturezaDemanda: [],
    Jornada: [], Modulo: null, Produto: null, Epic: null, EpicName: null, EpicStatus: null,
    TimeInTodo: null, LeadTime: null, LeadTimeP85: null, LeadTimeP15: null,
    TimeInStatus: {}, IsPlanned: false,
    DataQuality: {
      missingResolutionDate: false, missingAssignee: false, noStatusTransitions: false,
      noSprint: false, staleTodo: false, suspiciouslyLongLead: false, negativeLeadTime: false,
      historyComplete: true,
    },
    Source: 'api', ...overrides,
  };
}

function rawIssue(histories: StatusTransition[] = []): JiraApiIssue {
  return { changelog: { histories } } as unknown as JiraApiIssue;
}

console.log('\n▶ `Resolved` nunca é inventado (invariante do CLAUDE.md)');
{
  check('DONE sem resolutiondate mantém Resolved = null', () => {
    const out = calculateMetrics(baseItem(), rawIssue());
    assert.equal(out.Resolved, null, 'Resolved foi preenchido a partir de outra fonte');
  });

  check('DONE sem resolutiondate NÃO herda UpdatedAt', () => {
    const out = calculateMetrics(baseItem({ UpdatedAt: '2026-06-20T00:00:00Z' }), rawIssue());
    assert.notEqual(out.Resolved, '2026-06-20T00:00:00Z');
  });

  check('a flag de higiene volta a disparar (era código morto)', () => {
    const out = calculateMetrics(baseItem(), rawIssue());
    assert.equal(out.DataQuality.missingResolutionDate, true,
      'missingResolutionDate precisa ser true para DONE sem resolutiondate');
  });

  check('DONE sem resolutiondate não ganha LeadTime', () => {
    const out = calculateMetrics(baseItem(), rawIssue());
    assert.equal(out.LeadTime, null);
  });

  check('resolutiondate real é preservado e gera LeadTime', () => {
    const out = calculateMetrics(
      baseItem({ Resolved: '2026-06-11T00:00:00Z' }), rawIssue(),
    );
    assert.equal(out.Resolved, '2026-06-11T00:00:00Z');
    assert.equal(out.LeadTime, 10);
    assert.equal(out.DataQuality.missingResolutionDate, false);
  });
}

console.log('\n▶ Lead time negativo é dado sujo, não duração positiva');
{
  check('Resolved antes de Created → LeadTime null + flag (não Math.abs)', () => {
    const out = calculateMetrics(
      baseItem({ Created: '2026-06-10T00:00:00Z', Resolved: '2026-06-01T00:00:00Z' }),
      rawIssue(),
    );
    assert.equal(out.LeadTime, null, 'Math.abs transformaria isto em 9 dias plausíveis');
    assert.equal(out.DataQuality.negativeLeadTime, true);
  });
}

console.log('\n▶ Tendência semanal e snapshot concordam (divergência estrutural fechada)');
{
  // O `delivered` de trends.ts usava `parseDate(Resolved) ?? parseDate(UpdatedAt)`, enquanto
  // computeTeamPerformance exige Resolved real. O MESMO time tinha vazão diferente nas duas
  // telas. Este teste é o que impede a reintrodução por qualquer um dos dois lados.
  const items = [
    // Entrega real dentro da janela.
    baseItem({ Key: 'T-1', Resolved: '2026-06-10T12:00:00Z', UpdatedAt: '2026-06-10T12:00:00Z' }),
    // DONE sem resolução, com UpdatedAt DENTRO da janela: é a armadilha.
    baseItem({ Key: 'T-2', Resolved: null, UpdatedAt: '2026-06-11T12:00:00Z' }),
  ];
  const period = { start: '2026-06-08T00:00:00Z', end: '2026-06-14T00:00:00Z' };

  check('trends não conta DONE sem resolutiondate como entrega', () => {
    const trend = computeWeeklyPerformanceTrend(items, period);
    const totalEntregue = trend.reduce((sum, p) => sum + p.throughput, 0);
    assert.equal(totalEntregue, 1, 'T-2 (sem resolutiondate) não pode entrar na vazão');
  });

  check('snapshot e tendência reportam a MESMA vazão', () => {
    const snapshot = computeTeamPerformance(items, {
      teamId: 'TEAM', period, now: new Date('2026-06-20T00:00:00Z'),
    });
    const trend = computeWeeklyPerformanceTrend(items, period);
    const totalEntregue = trend.reduce((sum, p) => sum + p.throughput, 0);
    assert.equal(snapshot.delivery.throughput, totalEntregue,
      `snapshot=${snapshot.delivery.throughput} trend=${totalEntregue} — as telas divergem`);
  });
}

console.log('\n▶ Períodos não se sobrepõem (o delta "vs. anterior" vinha inflado)');
{
  // O par de períodos era montado à mão no hook, com `previousPeriod.end === period.start`, e
  // `isInPeriod` era FECHADO nas duas pontas — então o instante da fronteira (e, por causa do
  // `setUTCHours(23,59,59,999)`, todo o resto daquele dia) contava nos DOIS períodos.
  const period = { start: '2026-06-15T00:00:00Z', end: '2026-06-29T00:00:00Z' };
  const previous = previousPeriodOf(period);

  check('período anterior tem a MESMA duração', () => {
    const dur = (p: { start: string; end: string }) =>
      new Date(p.end).getTime() - new Date(p.start).getTime();
    assert.equal(dur(previous), dur(period));
  });

  check('o fim do anterior é o começo do atual (colados, sem buraco)', () => {
    assert.equal(previous.end, period.start);
  });

  // Item resolvido EXATAMENTE na fronteira: pertence a UM período só.
  const naFronteira = baseItem({ Key: 'F-1', Resolved: period.start, UpdatedAt: period.start });
  check('item na fronteira conta em exatamente UM dos dois períodos', () => {
    const atual = computeTeamPerformance([naFronteira], {
      teamId: 'TEAM', period, now: new Date('2026-07-01T00:00:00Z'),
    }).delivery.throughput;
    const anterior = computeTeamPerformance([naFronteira], {
      teamId: 'TEAM', period: previous, now: new Date('2026-07-01T00:00:00Z'),
    }).delivery.throughput;
    assert.equal(atual + anterior, 1, `atual=${atual} anterior=${anterior} — contagem dupla`);
  });

  // O caso que mais doía: o dia inteiro da fronteira era contado duas vezes.
  const noDiaDaFronteira = baseItem({
    Key: 'F-2', Resolved: '2026-06-15T18:30:00Z', UpdatedAt: '2026-06-15T18:30:00Z',
  });
  check('item no MEIO do dia da fronteira também conta uma só vez', () => {
    const atual = computeTeamPerformance([noDiaDaFronteira], {
      teamId: 'TEAM', period, now: new Date('2026-07-01T00:00:00Z'),
    }).delivery.throughput;
    const anterior = computeTeamPerformance([noDiaDaFronteira], {
      teamId: 'TEAM', period: previous, now: new Date('2026-07-01T00:00:00Z'),
    }).delivery.throughput;
    assert.equal(atual + anterior, 1, `atual=${atual} anterior=${anterior} — contagem dupla`);
  });
}

console.log('\n▶ Monte Carlo é determinístico (mesmo dado → mesma previsão)');
{
  const semanas = [3, 5, 2, 6, 4, 5, 1, 7];

  check('forecastWhen devolve o MESMO resultado em duas execuções', () => {
    const a = forecastWhen(semanas, 40);
    const b = forecastWhen(semanas, 40);
    assert.deepEqual(
      [a.p50, a.p70, a.p85, a.p95],
      [b.p50, b.p70, b.p85, b.p95],
      'Math.random() fazia o mesmo dado dar percentis diferentes a cada recarga',
    );
  });

  check('forecastHowMany também é determinístico', () => {
    const a = forecastHowMany(semanas, 8);
    const b = forecastHowMany(semanas, 8);
    assert.deepEqual([a.p50, a.p85], [b.p50, b.p85]);
  });

  check('histórico diferente muda a previsão (não é constante)', () => {
    const a = forecastWhen(semanas, 40);
    const b = forecastWhen([1, 1, 1, 1, 1, 1, 1, 1], 40);
    assert.notEqual(a.p85, b.p85, 'seed fixa demais tornaria a simulação insensível ao dado');
  });

  check('amostra pequena é marcada como insuficiente', () => {
    const curta = forecastWhen([3, 4, 5], 20);
    assert.equal(curta.sufficientSample, false);
    assert.equal(curta.sampleSize, 3);
  });

  check('amostra adequada é marcada como suficiente', () => {
    assert.equal(forecastWhen(semanas, 40).sufficientSample, true);
  });
}

console.log('\n▶ Um só predicado de descarte em todo o runtime');
{
  // `epics.ts` e `montecarlo.ts` tinham cópias com match EXATO ('CANCELADO'/'DESCARTADO'),
  // enquanto o canônico usa raízes por substring. Variantes reais do Jira ("DESCARTADOS",
  // "CANCELADO ❌") eram descartadas numa métrica e contadas na outra.
  const variantes = ['DESCARTADO', 'DESCARTADOS', 'CANCELADO', 'CANCELADO ❌', 'CANCELADA'];

  check('todas as variantes contam como descarte no predicado canônico', () => {
    for (const s of variantes) {
      assert.equal(isDiscardedStatus(s), true, `"${s}" deveria ser descarte`);
    }
  });

  check('variantes saem do backlog do forecast (era a cópia do montecarlo)', () => {
    const itens = variantes.map((Status, i) =>
      baseItem({ Key: `D-${i}`, Status, StatusCategory: 'TODO', Resolved: null }),
    );
    assert.equal(remainingBacklog(itens), 0, 'match exato deixava as variantes no backlog');
  });

  check('variantes saem da visão de épicos (era a cópia do epics)', () => {
    const itens = variantes.map((Status, i) =>
      baseItem({ Key: `E-${i}`, Status, StatusCategory: 'TODO', Resolved: null, Epic: 'EPIC-1' }),
    );
    const view = computeEpics(itens, new Date('2026-07-01T00:00:00Z'));
    assert.equal(view.withEpic + view.withoutEpic, 0, 'match exato mantinha as variantes ativas');
  });
}

console.log('\n▶ Contrato do DATASET (o schema validava item, não conjunto)');
{
  // O schema Zod de 8 campos com `.passthrough()` pegava lixo estrutural. Os erros que
  // machucam são de CONJUNTO — e todos publicam um dataset "válido" que descreve uma
  // realidade falsa, sobrescrevem o Blob e ninguém tem como saber.
  const bom = Array.from({ length: 1000 }, (_, i) =>
    baseItem({
      Key: `T-${i}`,
      Team: i % 2 ? 'GOL' : 'JETTA',
      Release: 'CEM-R1',
      Resolved: '2026-06-10T00:00:00Z',
      Created: '2026-06-01T00:00:00Z',
    }),
  );
  const baseline = baselineFrom(bom);
  // `b` explicitamente nullable: alguns casos testam SEM baseline (primeiro sync), que é
  // quando só as regras absolutas valem.
  const bloqueios = (items: DashboardItem[], b: DatasetBaseline | null = baseline) =>
    checkDatasetContract(items, b).filter((v) => v.severidade === 'bloqueia').map((v) => v.regra);

  check('dataset saudável não gera bloqueio', () => {
    assert.deepEqual(bloqueios(bom), []);
  });

  check('volume abaixo do piso bloqueia (credencial/JQL errado)', () => {
    assert.ok(bloqueios(bom.slice(0, 100), null).includes('volume-minimo'));
  });

  check('queda grande vs. baseline bloqueia (itens não desaparecem do Jira)', () => {
    // 600 de 1000 = −40%, acima do teto de 30%. Passa do piso absoluto, então SÓ a regra
    // comparativa pega — é exatamente o caso que sem baseline seria invisível.
    const regras = bloqueios(bom.slice(0, 600));
    assert.ok(regras.includes('queda-de-volume'), `regras=${regras.join(',')}`);
  });

  check('Key duplicada bloqueia (paginação repetida dobra a vazão)', () => {
    const comDup = [...bom, baseItem({ Key: 'T-1', Team: 'GOL', Release: 'CEM-R1' })];
    assert.ok(bloqueios(comDup).includes('chave-duplicada'));
  });

  check('time que desapareceu bloqueia (campo renomeado no Jira)', () => {
    const semJetta = bom.filter((i) => i.Team !== 'JETTA');
    // Passa o baseline original, que conhecia os dois times.
    const regras = checkDatasetContract(semJetta, baseline)
      .filter((v) => v.severidade === 'bloqueia')
      .map((v) => v.regra);
    assert.ok(regras.includes('time-desaparecido'), `regras=${regras.join(',')}`);
  });

  check('drift de custom field bloqueia (100% sem Release)', () => {
    const semRelease = bom.map((i) => ({ ...i, Release: 'OUTROS' }));
    assert.ok(bloqueios(semRelease).includes('drift-release'));
  });

  check('maioria dos DONE sem resolutiondate bloqueia (campo saiu da busca)', () => {
    const semResolucao = bom.map((i) => ({ ...i, Resolved: null }));
    assert.ok(bloqueios(semResolucao).includes('resolutiondate-ausente-em-massa'));
  });

  check('data não parseável bloqueia', () => {
    const ruim = [...bom, baseItem({ Key: 'T-X', Team: 'GOL', Release: 'CEM-R1', Created: 'ontem' })];
    assert.ok(bloqueios(ruim).includes('data-invalida'));
  });

  check('Resolved < Created alerta mas NÃO bloqueia (é sujeira do Jira, não do sync)', () => {
    const invertido = [
      ...bom,
      baseItem({ Key: 'T-Y', Team: 'GOL', Release: 'CEM-R1', Created: '2026-06-10T00:00:00Z', Resolved: '2026-06-01T00:00:00Z' }),
    ];
    const v = checkDatasetContract(invertido, baseline);
    assert.ok(v.some((x) => x.regra === 'resolvido-antes-de-criado' && x.severidade === 'alerta'));
    assert.ok(!bloqueios(invertido).includes('resolvido-antes-de-criado'));
  });

  check('histórico parcial em massa ALERTA mas não bloqueia', () => {
    // Entrega e lead time vêm de `resolutiondate`, não do changelog — seguem válidos. O que
    // fica não confiável é cycle time por etapa e TimeInTodo. Bloquear o sync por isso
    // sacrificaria dado bom junto com o duvidoso.
    const parciais = bom.map((i) => ({ ...i, DataQuality: { ...i.DataQuality, historyComplete: false } }));
    const v = checkDatasetContract(parciais, baseline);
    assert.ok(v.some((x) => x.regra === 'historico-parcial' && x.severidade === 'alerta'));
    assert.deepEqual(bloqueios(parciais), []);
  });

  check('histórico completo não gera alerta', () => {
    const v = checkDatasetContract(bom, baseline);
    assert.ok(!v.some((x) => x.regra === 'historico-parcial'));
  });

  check('time novo alerta mas não bloqueia', () => {
    const comNovo = [...bom, baseItem({ Key: 'T-Z', Team: 'NIVUS', Release: 'CEM-R1' })];
    const v = checkDatasetContract(comNovo, baseline);
    assert.ok(v.some((x) => x.regra === 'time-novo' && x.severidade === 'alerta'));
    assert.deepEqual(bloqueios(comNovo), []);
  });
}

console.log(`\n✔ ${checks} invariantes verificadas\n`);
