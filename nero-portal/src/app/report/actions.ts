"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { buildReportData } from "@/lib/report/build";
import { generateReportNarrative } from "@/lib/nero/generate";
import { createReport } from "@/lib/state/mutations";

/**
 * Gera e persiste o report da quinzena: snapshot determinístico do estado +
 * narrativas do Nero (com fallback determinístico se a IA falhar). O período
 * começa onde o report anterior terminou (ou 14 dias atrás, no primeiro).
 */
export async function generateReportAction() {
  const prev = await prisma.report.findFirst({ orderBy: { numero: "desc" } });
  const fim = new Date();
  const inicio = prev?.periodoFim ?? new Date(fim.getTime() - 14 * 24 * 60 * 60 * 1000);

  const data = await buildReportData(inicio, fim);
  const { narrativa } = await generateReportNarrative(data);

  const report = await createReport({
    statusGeral: narrativa.statusGeral,
    snapshot: data,
    sumarioExecutivo: narrativa.sumarioExecutivo,
    notaAdvisor: narrativa.notaAdvisor,
    saudeFrentes: narrativa.saudeFrentes,
  });

  revalidatePath("/report");
  redirect(`/report/${report.id}`);
}
