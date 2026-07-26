import type { Report } from "@prisma/client";
import type { ReportData, SaudeFrente } from "./build";

/**
 * Serializa um report persistido para markdown no formato do kit 04 —
 * a "ponte Confluence" v1: copiar e colar direto numa página.
 */

const RAG_EMOJI: Record<string, string> = {
  verde: "🟢",
  amarelo: "🟡",
  vermelho: "🔴",
};

const day = (d: Date) => new Date(d).toISOString().slice(0, 10);

export function reportToMarkdown(report: Report, data: ReportData): string {
  const L: string[] = [];
  const saude: SaudeFrente[] = report.saudeFrentes
    ? (JSON.parse(report.saudeFrentes) as SaudeFrente[])
    : data.saudeFrentes;

  L.push(`## Report Quinzenal #${report.numero} | Projeto Data Lake LM`);
  L.push("");
  L.push(
    `**Período:** ${day(report.periodoInicio)} a ${day(report.periodoFim)} · ` +
      `**Fase atual:** ${data.faseAtual} · ` +
      `**Status geral:** ${RAG_EMOJI[report.statusGeral] ?? "🟡"}`,
  );

  L.push("", "### 1. Sumário executivo");
  L.push(`> ${report.sumarioExecutivo ?? "—"}`);

  L.push("", "### 2. Entregas concluídas na quinzena", "");
  if (data.entregas.length) {
    L.push("| Entrega | Epic/Feature | Área DAMA | Data |", "|---|---|---|---|");
    for (const e of data.entregas) {
      L.push(`| ${e.titulo} | ${e.origem} | ${e.areaDama ?? "—"} | ${e.data} |`);
    }
  } else L.push("_Sem entregas concluídas no período._");

  L.push("", "### 3. Em andamento", "");
  if (data.emAndamento.length) {
    L.push("| Item | % | Depende do LM? |", "|---|---|---|");
    for (const f of data.emAndamento) {
      L.push(`| ${f.codigo} — ${f.titulo} | ${f.pct}% | ${f.dependeLM ? "Sim" : "Não"} |`);
    }
  } else L.push("_Nada em andamento registrado._");

  L.push("", "### 4. Indicadores de adoção (vs baseline)", "");
  if (data.indicadores.length) {
    L.push("| Métrica | Baseline | Atual |", "|---|---|---|");
    for (const i of data.indicadores) {
      L.push(`| ${i.metrica} | ${i.baseline ?? "—"} | ${i.atual ?? "—"} |`);
    }
  } else L.push("_Baseline não capturada._");

  L.push("", "### 5. Maturidade DAMA (radar)", "");
  const avaliadas = data.maturidade.filter((m) => m.nivelAtual !== null || m.nivelMeta !== null);
  if (avaliadas.length) {
    L.push("| Área | Atual | Meta | Status de verdade |", "|---|---|---|---|");
    for (const m of avaliadas) {
      L.push(`| ${m.area} | ${m.nivelAtual ?? "—"} | ${m.nivelMeta ?? "—"} | ${m.statusVerdade} |`);
    }
  } else L.push("_Maturidade ainda não avaliada (lacuna)._");

  L.push("", "### 6. Riscos", "");
  if (data.riscos.length) {
    L.push("| Risco | Sev | Tendência | Mitigação |", "|---|---|---|---|");
    for (const r of data.riscos) {
      L.push(`| ${r.codigo} — ${r.descricao} | ${r.severidade} | ${r.tendencia} | ${r.mitigacao ?? "—"} |`);
    }
  } else L.push("_Sem riscos ativos._");

  L.push("", "### 7. 🔴 Blockers & dependências do cliente LM (aging)", "");
  if (data.blockers.length) {
    L.push(
      "| # | O que precisamos do LM | Solicitado em | Aging (dias úteis) | Trilho paralelo | Decisão pedida |",
      "|---|---|---|---|---|---|",
    );
    for (const b of data.blockers) {
      const aging =
        b.agingDias === null ? "—" : `${b.agingDias}${b.agingNivel === "vermelho" ? " 🔴" : ""}`;
      L.push(
        `| ${b.codigo} | ${b.descricao} | ${b.solicitadoEm ?? "—"} | ${aging} | ${b.trilhoParalelo ?? "—"} | ${b.decisaoPedida ?? "—"} |`,
      );
    }
  } else L.push("_Sem dependências abertas._");

  L.push("", "### 8. Decisões necessárias do cliente/sponsor");
  if (data.decisoesPendentes.length) {
    for (const d of data.decisoesPendentes) L.push(`- [ ] ${d}`);
  } else L.push("_Nenhuma decisão pendente registrada._");

  L.push("", "### 9. Saúde do projeto (RAG por frente)", "");
  L.push("| Frente | Status | Comentário |", "|---|---|---|");
  for (const f of saude) {
    L.push(`| ${f.frente} | ${RAG_EMOJI[f.rag] ?? "🟡"} | ${f.comentario} |`);
  }

  L.push("", "### 10. Nota do advisor (Nero)");
  L.push(`> ${report.notaAdvisor ?? "—"}`);

  L.push("", "---", `*Gerado a partir do estado vivo do portal em ${day(report.geradoEm)}.*`);
  return L.join("\n");
}
