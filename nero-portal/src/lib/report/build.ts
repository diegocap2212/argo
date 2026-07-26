import { prisma } from "@/lib/db";
import { agingDias, agingNivel, type AgingNivel } from "@/lib/state/aging";
import { assetCompleteness } from "@/lib/catalog/completeness";
import { loadRoadmap } from "@/lib/state/queries";

/**
 * Builder DETERMINÍSTICO do report quinzenal (kit 04): monta as seções
 * estruturadas direto do banco, sem IA. As seções narrativas (sumário
 * executivo, saúde por frente, nota do advisor) são preenchidas depois
 * pelo Nero (src/lib/nero/generate.ts) — e têm default utilizável caso a
 * geração falhe ou não haja API key.
 */

export type ReportEntrega = {
  titulo: string;
  origem: string; // ex.: "F0.1", "Decisão", "Catálogo"
  areaDama: string | null;
  data: string; // YYYY-MM-DD
};

export type ReportEmAndamento = {
  codigo: string;
  titulo: string;
  pct: number; // % do checklist
  dependeLM: boolean;
};

export type ReportIndicador = {
  metrica: string;
  baseline: string | null;
  atual: string | null;
};

export type ReportRisco = {
  codigo: string;
  descricao: string;
  severidade: string;
  tendencia: "↑" | "→" | "↓" | "novo";
  mitigacao: string | null;
};

export type ReportBlocker = {
  codigo: string;
  descricao: string;
  solicitadoEm: string | null;
  agingDias: number | null;
  agingNivel: AgingNivel;
  trilhoParalelo: string | null;
  decisaoPedida: string | null;
};

export type ReportMaturidade = {
  area: string;
  nivelAtual: number | null;
  nivelMeta: number | null;
  statusVerdade: string;
};

export type SaudeFrente = { frente: string; rag: "verde" | "amarelo" | "vermelho"; comentario: string };

export type ReportData = {
  faseAtual: string;
  entregas: ReportEntrega[];
  emAndamento: ReportEmAndamento[];
  indicadores: ReportIndicador[];
  riscos: ReportRisco[];
  blockers: ReportBlocker[];
  decisoesPendentes: string[];
  maturidade: ReportMaturidade[];
  saudeFrentes: SaudeFrente[]; // heurística default; o Nero pode sobrescrever
  statusGeralDefault: "verde" | "amarelo" | "vermelho";
  catalogoResumo: { total: number; prontas: number }; // ativos e % médio de completude
};

type Snap = Record<string, unknown>;

function parseSnap(json: string | null): Snap | null {
  if (!json) return null;
  try {
    const v = JSON.parse(json);
    return typeof v === "object" && v !== null ? (v as Snap) : null;
  } catch {
    return null;
  }
}

const day = (d: Date) => d.toISOString().slice(0, 10);

export async function buildReportData(inicio: Date, fim: Date): Promise<ReportData> {
  const [versions, roadmap, baseline, risks, deps, maturity, catalog, prevReport] =
    await Promise.all([
      prisma.stateVersion.findMany({
        where: { desfeito: false, createdAt: { gte: inicio, lte: fim } },
        orderBy: { createdAt: "asc" },
      }),
      loadRoadmap(),
      prisma.baselineMetric.findMany({ orderBy: { ordem: "asc" } }),
      prisma.risk.findMany({ where: { ativo: true }, orderBy: { createdAt: "asc" } }),
      prisma.dependency.findMany({
        where: { status: "aguardando" },
        orderBy: { ordem: "asc" },
      }),
      prisma.maturityAssessment.findMany({ orderBy: { ordem: "asc" } }),
      prisma.catalogAsset.findMany({ include: { campos: true } }),
      prisma.report.findFirst({ orderBy: { numero: "desc" } }),
    ]);

  // Mapa featureId → (codigo, areaDama) para anotar entregas de checklist.
  const featureById = new Map<string, { codigo: string; areaDama: string | null }>();
  for (const p of roadmap)
    for (const f of p.features) featureById.set(f.id, { codigo: f.codigo, areaDama: f.areaDama });

  // ---- §2 Entregas da quinzena (da auditoria; dedupe por entityId, mais recente vence) ----
  const byEntity = new Map<string, ReportEntrega>();
  for (const v of versions) {
    const after = parseSnap(v.after);
    if (!after) continue;
    const data = day(v.createdAt);
    const key = `${v.entity}:${v.entityId}`;

    if (v.entity === "Feature" && after.status === "concluida") {
      byEntity.set(key, {
        titulo: String(after.titulo ?? after.codigo ?? "Feature concluída"),
        origem: String(after.codigo ?? "Feature"),
        areaDama: (after.areaDama as string | null) ?? null,
        data,
      });
    } else if (v.entity === "ChecklistItem" && after.done === true) {
      const feat = featureById.get(String(after.featureId ?? ""));
      byEntity.set(key, {
        titulo: String(after.texto ?? "Entregável concluído"),
        origem: feat?.codigo ?? "Checklist",
        areaDama: feat?.areaDama ?? null,
        data,
      });
    } else if (v.entity === "Decision" && v.operation === "create") {
      byEntity.set(key, {
        titulo: String(after.decisao ?? "Decisão registrada"),
        origem: "Decisão",
        areaDama: "Data Governance",
        data,
      });
    } else if (v.entity === "CatalogAsset") {
      byEntity.set(key, {
        titulo: `Tabela documentada no catálogo: ${String(after.nome ?? "?")}`,
        origem: "Catálogo",
        areaDama: "Metadata",
        data,
      });
    }
  }
  const entregas = [...byEntity.values()];

  // ---- §3 Em andamento ----
  const emAndamento: ReportEmAndamento[] = [];
  for (const p of roadmap) {
    for (const f of p.features) {
      if (f.status !== "em_andamento") continue;
      const total = f.checklist.length;
      const done = f.checklist.filter((c) => c.done).length;
      emAndamento.push({
        codigo: f.codigo,
        titulo: f.titulo,
        pct: total > 0 ? Math.round((done / total) * 100) : 0,
        dependeLM: f.dependeLM,
      });
    }
  }

  // ---- §5 Indicadores vs baseline ----
  const indicadores: ReportIndicador[] = baseline.map((b) => ({
    metrica: b.metrica,
    baseline: b.valorInicial,
    atual: b.atual,
  }));

  // ---- §6 Riscos (tendência vs. snapshot do report anterior) ----
  const prevSnap = parseSnap(prevReport?.snapshot ?? null);
  const prevRiscos = Array.isArray(prevSnap?.riscos)
    ? (prevSnap.riscos as Array<{ codigo?: string; severidade?: string }>)
    : [];
  const sevRank: Record<string, number> = { Baixa: 1, ["Média"]: 2, Alta: 3 };
  const riscos: ReportRisco[] = risks.map((r) => {
    const prev = prevRiscos.find((p) => p.codigo === r.codigo);
    let tendencia: ReportRisco["tendencia"];
    if (!prev) tendencia = prevReport ? "novo" : "→";
    else {
      const d = (sevRank[r.severidade] ?? 2) - (sevRank[prev.severidade ?? ""] ?? 2);
      tendencia = d > 0 ? "↑" : d < 0 ? "↓" : "→";
    }
    return {
      codigo: r.codigo,
      descricao: r.descricao,
      severidade: r.severidade,
      tendencia,
      mitigacao: r.mitigacao,
    };
  });

  // ---- §7 Blockers com aging ----
  const now = fim;
  const blockers: ReportBlocker[] = deps.map((d) => {
    const dias = agingDias(d.solicitadoEm, now);
    return {
      codigo: d.codigo,
      descricao: d.descricao,
      solicitadoEm: d.solicitadoEm ? day(d.solicitadoEm) : null,
      agingDias: dias,
      agingNivel: agingNivel(dias),
      trilhoParalelo: d.trilhoParalelo,
      decisaoPedida: d.decisaoPedida,
    };
  });

  // ---- §8 Decisões pendentes ----
  const decisoesPendentes = deps
    .filter((d) => d.decisaoPedida)
    .map((d) => `${d.decisaoPedida} (${d.codigo})`);

  // ---- Radar de maturidade (entra no report como snapshot) ----
  const maturidade: ReportMaturidade[] = maturity.map((m) => ({
    area: m.area,
    nivelAtual: m.nivelAtual,
    nivelMeta: m.nivelMeta,
    statusVerdade: m.statusVerdade,
  }));

  // ---- Fase atual: primeira fase (por ordem) não concluída e não-cinza; senão a primeira ----
  const ativa =
    roadmap.find((p) => p.rag !== "cinza" && p.pctDerived < 100) ??
    roadmap.find((p) => p.rag !== "cinza") ??
    roadmap[0];
  const faseAtual = ativa?.fase ?? "—";

  // ---- §9 Saúde por frente (heurística default — o Nero pode sobrescrever) ----
  const worstAging = Math.max(0, ...blockers.map((b) => b.agingDias ?? 0));
  const ragDeps: SaudeFrente["rag"] =
    worstAging >= 5 ? "vermelho" : worstAging >= 2 ? "amarelo" : "verde";
  const altas = riscos.filter((r) => r.severidade === "Alta").length;
  const ragPrazo: SaudeFrente["rag"] =
    ativa?.rag === "vermelho" ? "vermelho" : ativa?.rag === "verde" ? "verde" : "amarelo";
  const saudeFrentes: SaudeFrente[] = [
    {
      frente: "Escopo/Roadmap",
      rag: altas >= 3 ? "vermelho" : altas >= 1 ? "amarelo" : "verde",
      comentario: altas ? `${altas} risco(s) de severidade Alta ativos` : "Sem riscos altos ativos",
    },
    {
      frente: "Prazo",
      rag: ragPrazo,
      comentario: ativa ? `${ativa.fase}: ${ativa.pctDerived}% concluída` : "—",
    },
    {
      frente: "Dependências LM",
      rag: ragDeps,
      comentario: blockers.length
        ? `${blockers.length} pendência(s); maior aging: ${worstAging} dia(s) útil(eis)`
        : "Sem pendências abertas",
    },
    {
      frente: "Qualidade das entregas",
      rag: "verde",
      comentario: "Sem apontamentos",
    },
  ];

  const statusGeralDefault: ReportData["statusGeralDefault"] =
    ragDeps === "vermelho" || altas >= 3
      ? "vermelho"
      : ragDeps === "amarelo" || altas >= 1
        ? "amarelo"
        : "verde";

  // ---- Resumo do catálogo ----
  const prontas = catalog.filter((a) => assetCompleteness(a, a.campos).pct === 100).length;

  return {
    faseAtual,
    entregas,
    emAndamento,
    indicadores,
    riscos,
    blockers,
    decisoesPendentes,
    maturidade,
    saudeFrentes,
    statusGeralDefault,
    catalogoResumo: { total: catalog.length, prontas },
  };
}
