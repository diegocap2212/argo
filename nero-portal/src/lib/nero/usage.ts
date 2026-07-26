import { prisma } from "@/lib/db";
import { monthlyBudgetUsd } from "./pricing";

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
