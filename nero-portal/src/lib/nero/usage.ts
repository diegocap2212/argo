import { prisma } from "@/lib/db";
import { monthlyBudgetUsd } from "./pricing";

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
