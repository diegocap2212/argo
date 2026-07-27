import { prisma } from "@/lib/db";
import { maxTurnCostUsd, monthlyBudgetUsd, userMonthlyBudgetUsd, type TurnUsage } from "./pricing";

/**
 * Estourou o orçamento do mês. O chamador HTTP traduz para 429.
 * Classe própria (e não Error genérico) para o gate ser distinguível de falha do modelo.
 */
export class BudgetExceededError extends Error {
  readonly costUsd: number;
  readonly budgetUsd: number;
  constructor(costUsd: number, budgetUsd: number) {
    super(
      `Orçamento mensal do Nero esgotado: US$ ${costUsd.toFixed(2)} de US$ ${budgetUsd.toFixed(2)}. ` +
        `Ajuste NERO_MONTHLY_BUDGET_USD ou aguarde a virada do mês.`,
    );
    this.name = "BudgetExceededError";
    this.costUsd = costUsd;
    this.budgetUsd = budgetUsd;
  }
}

/**
 * Uma PESSOA estourou o teto individual, mas o orçamento do time ainda tem saldo.
 * Erro separado porque a mensagem e a ação são diferentes: aqui não se aumenta o teto global,
 * conversa-se com quem gastou.
 */
export class UserBudgetExceededError extends Error {
  readonly costUsd: number;
  readonly budgetUsd: number;
  constructor(costUsd: number, budgetUsd: number) {
    super(
      `Seu consumo do mês no Nero chegou a US$ ${costUsd.toFixed(2)} de US$ ${budgetUsd.toFixed(2)}. ` +
        `O orçamento do time segue disponível — fale com o responsável para ajustar seu limite.`,
    );
    this.name = "UserBudgetExceededError";
    this.costUsd = costUsd;
    this.budgetUsd = budgetUsd;
  }
}

// Memo curto do gasto do mês. O laço agêntico chama streamTurn até 8× por request; sem isso
// seriam 8 agregações por conversa. O TTL limita tanto a carga no banco quanto o quanto o
// gasto pode passar do teto antes de o freio perceber. Mesmo padrão do cache de api/data.ts.
const SPEND_TTL_MS = 30_000;
let spendCache: { costUsd: number; at: number } | null = null;

async function monthSpendUsd(): Promise<number> {
  const now = Date.now();
  if (spendCache && now - spendCache.at < SPEND_TTL_MS) return spendCache.costUsd;
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const agg = await prisma.usageLog.aggregate({
    where: { createdAt: { gte: startOfMonth } },
    _sum: { costUsd: true },
  });
  const costUsd = agg._sum.costUsd ?? 0;
  spendCache = { costUsd, at: now };
  return costUsd;
}

/**
 * FREIO de orçamento — chamado por streamTurn, o único ponto de IA do portal.
 *
 * Antes deste guarda, NERO_MONTHLY_BUDGET_USD era só um medidor: o BudgetMeter mostrava a
 * porcentagem e nada impedia a chamada seguinte. Um laço agêntico com 8 turnos × 16k tokens
 * podia passar do teto sem nenhum obstáculo — era o risco financeiro nº 1 do produto.
 *
 * Fail-OPEN por decisão consciente: se a leitura do gasto falhar, a chamada passa. O oposto
 * (fail-closed) transformaria uma indisponibilidade do Postgres em "o Nero parou de
 * funcionar", e o teto é controle de CUSTO, não de segurança — diferente do gate de acesso,
 * que fecha. A falha é logada em nível de erro para não passar silenciosa.
 */
export async function assertWithinBudget(): Promise<void> {
  const budgetUsd = monthlyBudgetUsd();
  let costUsd: number;
  try {
    costUsd = await monthSpendUsd();
  } catch (e) {
    console.error(
      `[Nero] FALHA AO LER O GASTO DO MÊS — freio de orçamento IGNORADO nesta chamada :: ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
    return;
  }
  if (costUsd >= budgetUsd) throw new BudgetExceededError(costUsd, budgetUsd);
}

/** Invalida o memo do gasto (usar após gravar UsageLog para o freio ver o valor novo). */
export function invalidateSpendCache(): void {
  spendCache = null;
}

// ════════════════════════════════════════════════════════════════════════════
// RESERVA ATÔMICA DE CUSTO
//
// `assertWithinBudget` acima é uma LEITURA. Duas requisições concorrentes leem o mesmo saldo
// e passam as duas — cada uma achando que havia orçamento. Com o memo de 30s, a janela é
// ainda maior: até 8 turnos de uma conversa podiam rodar sobre um saldo velho.
//
// Aqui o gasto é GRAVADO antes da chamada, com o custo máximo do turno, dentro de uma
// transação serializada por advisory lock. Efeitos:
//   · o gasto fica visível para os outros leitores no mesmo instante;
//   · se o `UsageLog` real falhar depois, a estimativa CONSERVADORA permanece contada —
//     antes uma falha de persistência abria um buraco permanente no orçamento;
//   · a reserva é reconciliada por `settleTurn` com o consumo real.
// ════════════════════════════════════════════════════════════════════════════

/**
 * Chave do advisory lock. Constante arbitrária, só precisa ser estável e não colidir com
 * outros locks do banco. Serializa APENAS a janela "ler saldo + reservar", que é curta.
 */
const BUDGET_LOCK_KEY = 918_273_645;

/**
 * Reserva orçamento para um turno. Lança `BudgetExceededError` se o teto já foi atingido.
 *
 * Devolve o id da linha de reserva, ou `null` se a reserva não pôde ser gravada. `null`
 * mantém o comportamento fail-open já decidido para o freio (é controle de CUSTO, não de
 * segurança — indisponibilidade do Postgres não deve derrubar o Nero), mas com log de erro.
 */
export async function reserveTurn(
  model: string,
  maxOutputTokens: number,
  actorEmail: string | null = null,
): Promise<string | null> {
  const budgetUsd = monthlyBudgetUsd();
  const perUserUsd = userMonthlyBudgetUsd();
  const estimate = maxTurnCostUsd(model, maxOutputTokens);
  try {
    const id = await prisma.$transaction(async (tx) => {
      // Serializa a janela ler→reservar. Sem isto, duas transações leem o mesmo total.
      await tx.$executeRaw`select pg_advisory_xact_lock(${BUDGET_LOCK_KEY})`;

      // Leitura SEM cache: dentro do lock, o valor tem de ser o do banco agora.
      const startOfMonth = startOfCurrentMonth();
      const agg = await tx.usageLog.aggregate({
        where: { createdAt: { gte: startOfMonth } },
        _sum: { costUsd: true },
      });
      const costUsd = agg._sum.costUsd ?? 0;
      if (costUsd >= budgetUsd) throw new BudgetExceededError(costUsd, budgetUsd);

      // Teto POR PESSOA. O orçamento era só global, então uma pessoa sozinha podia consumir
      // o mês do time — sem malícia, só um laço agêntico longo num dia ruim.
      if (actorEmail) {
        const mine = await tx.usageLog.aggregate({
          where: { actorEmail, createdAt: { gte: startOfMonth } },
          _sum: { costUsd: true },
        });
        const myCost = mine._sum?.costUsd ?? 0;
        if (myCost >= perUserUsd) throw new UserBudgetExceededError(myCost, perUserUsd);
      }

      const row = await tx.usageLog.create({
        data: { model, costUsd: estimate, estimated: true, actorEmail },
      });
      return row.id;
    });
    invalidateSpendCache();
    return id;
  } catch (e) {
    // Estouro de orçamento é decisão de NEGÓCIO, não falha de infra: propaga (a rota traduz
    // para 429). Os DOIS precisam estar aqui — deixar o teto por pessoa cair no catch-all
    // abaixo o transformaria em "reserva falhou, segue o turno", anulando o limite.
    if (e instanceof BudgetExceededError || e instanceof UserBudgetExceededError) throw e;
    console.error(
      `[Nero] FALHA AO RESERVAR ORÇAMENTO — turno segue sem reserva (model=${model}) :: ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
    return null;
  }
}

/**
 * Troca a reserva pelo consumo REAL do turno.
 *
 * Se `reservationId` é null (reserva falhou), grava uma linha nova — assim o consumo entra na
 * conta de qualquer jeito. Se a reconciliação falhar, a reserva conservadora fica: o erro
 * passa a superestimar o gasto, nunca a ignorá-lo.
 */
export async function settleTurn(
  reservationId: string | null,
  model: string,
  usage: TurnUsage,
  costUsd: number,
): Promise<void> {
  try {
    if (reservationId) {
      await prisma.usageLog.update({
        where: { id: reservationId },
        data: { ...usage, costUsd, estimated: false },
      });
    } else {
      await prisma.usageLog.create({ data: { model, ...usage, costUsd, estimated: false } });
    }
    invalidateSpendCache();
  } catch (e) {
    console.error(
      `[Nero] FALHA AO RECONCILIAR CONSUMO — model=${model} custo=$${costUsd.toFixed(4)} ` +
        `reserva=${reservationId ?? "nenhuma"} tokens=${JSON.stringify(usage)} :: ${
          e instanceof Error ? e.message : String(e)
        }`,
    );
    // A reserva (se houve) permanece contada. Invalida o cache para o próximo leitor ver.
    invalidateSpendCache();
  }
}

/** Início do mês corrente — usado pela reserva e pelo medidor, para não divergirem. */
function startOfCurrentMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

/** Consumo do mês corrente vs. orçamento — base do medidor de budget. */
export async function getMonthUsage() {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const agg = await prisma.usageLog.aggregate({
    where: { createdAt: { gte: startOfMonth } },
    _sum: {
      costUsd: true,
      inputTokens: true,
      outputTokens: true,
      cacheReadTokens: true,
      cacheWriteTokens: true,
    },
    _count: true,
  });

  const costUsd = agg._sum.costUsd ?? 0;
  const budgetUsd = monthlyBudgetUsd();

  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  endOfMonth.setHours(23, 59, 59, 999);
  const remainingDays = Math.max(0, Math.ceil((endOfMonth.getTime() - now.getTime()) / 86_400_000));

  return {
    costUsd,
    budgetUsd,
    pct: budgetUsd > 0 ? Math.min(100, (costUsd / budgetUsd) * 100) : 0,
    turns: agg._count,
    tokens: {
      input: agg._sum.inputTokens ?? 0,
      output: agg._sum.outputTokens ?? 0,
      cacheRead: agg._sum.cacheReadTokens ?? 0,
      cacheWrite: agg._sum.cacheWriteTokens ?? 0,
    },
    since: startOfMonth.toISOString(),
    resetAt: endOfMonth.toISOString(),
    remainingDays,
  };
}

export type MonthUsage = Awaited<ReturnType<typeof getMonthUsage>>;
