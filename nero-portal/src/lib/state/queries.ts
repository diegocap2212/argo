import { prisma } from "@/lib/db";
import { agingDias } from "./aging";
import { assetCompleteness } from "@/lib/catalog/completeness";
import type { Prisma } from "@prisma/client";

/** Carrega todo o estado vivo do projeto em paralelo (para o dashboard /estado). */
export async function loadProjectState() {
  const [stack, dependencies, decisions, risks, phases, stakeholders, baseline] =
    await Promise.all([
      prisma.stackItem.findMany({ orderBy: { ordem: "asc" } }),
      prisma.dependency.findMany({ orderBy: { ordem: "asc" } }),
      prisma.decision.findMany({ orderBy: { data: "desc" } }),
      prisma.risk.findMany({ orderBy: { createdAt: "asc" } }),
      prisma.phaseStatus.findMany({ orderBy: { ordem: "asc" } }),
      prisma.stakeholder.findMany({ orderBy: { ordem: "asc" } }),
      prisma.baselineMetric.findMany({ orderBy: { ordem: "asc" } }),
    ]);
  return { stack, dependencies, decisions, risks, phases, stakeholders, baseline };
}

export type ProjectState = Awaited<ReturnType<typeof loadProjectState>>;

// ---- Tipos para o roadmap ----

type PhaseWithFeatures = Prisma.PhaseStatusGetPayload<{
  include: { features: { include: { checklist: true } } };
}>;

export type RoadmapPhase = PhaseWithFeatures & {
  pctDerived: number;
  totalFeatures: number;
  doneFeatures: number;
  totalChecklist: number;
  doneChecklist: number;
  riskDepsCount: number;
  highRisksCount: number;
};

export type PhaseDetail = {
  phase: PhaseWithFeatures;
  deps: Prisma.DependencyGetPayload<object>[];
  risks: Prisma.RiskGetPayload<object>[];
  decisions: Prisma.DecisionGetPayload<object>[];
};

/** Carrega todas as fases com agregados para o stepper do roadmap. */
export async function loadRoadmap(): Promise<RoadmapPhase[]> {
  const [phases, allDeps, allRisks] = await Promise.all([
    prisma.phaseStatus.findMany({
      orderBy: { ordem: "asc" },
      include: { features: { orderBy: { ordem: "asc" }, include: { checklist: true } } },
    }),
    prisma.dependency.findMany({ where: { faseId: { not: null } } }),
    prisma.risk.findMany({ where: { faseId: { not: null }, ativo: true } }),
  ]);

  const now = new Date();

  return phases.map((phase) => {
    const totalFeatures = phase.features.length;
    const doneFeatures = phase.features.filter((f) => f.status === "concluida").length;
    const pctDerived =
      totalFeatures > 0 ? Math.round((doneFeatures / totalFeatures) * 100) : 0;

    const totalChecklist = phase.features.reduce((s, f) => s + f.checklist.length, 0);
    const doneChecklist = phase.features.reduce(
      (s, f) => s + f.checklist.filter((c) => c.done).length,
      0,
    );

    const phaseDeps = allDeps.filter((d) => d.faseId === phase.id);
    const riskDepsCount = phaseDeps.filter((d) => {
      if (d.status !== "aguardando" || !d.solicitadoEm) return false;
      return (agingDias(d.solicitadoEm, now) ?? 0) >= 5;
    }).length;

    const highRisksCount = allRisks.filter(
      (r) => r.faseId === phase.id && r.severidade === "Alta",
    ).length;

    return {
      ...phase,
      pctDerived,
      totalFeatures,
      doneFeatures,
      totalChecklist,
      doneChecklist,
      riskDepsCount,
      highRisksCount,
    };
  });
}

/** Carrega o detalhe de uma fase (painel 360°). */
export async function loadPhase(slug: string): Promise<PhaseDetail | null> {
  const phase = await prisma.phaseStatus.findFirst({
    where: { slug },
    include: {
      features: {
        orderBy: { ordem: "asc" },
        include: { checklist: { orderBy: { ordem: "asc" } } },
      },
    },
  });
  if (!phase) return null;

  const [deps, risks, decisions] = await Promise.all([
    prisma.dependency.findMany({
      where: { faseId: phase.id },
      orderBy: { ordem: "asc" },
    }),
    prisma.risk.findMany({
      where: { faseId: phase.id, ativo: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.decision.findMany({
      where: { faseId: phase.id },
      orderBy: { data: "desc" },
    }),
  ]);

  return { phase, deps, risks, decisions };
}

/** Constrói o bloco de contexto compacto de uma fase para injetar no system do Nero. */
export function buildPhaseContext(detail: PhaseDetail): string {
  const { phase, deps, risks, decisions } = detail;
  const ragEmoji =
    { cinza: "⚪", amarelo: "🟡", verde: "🟢", vermelho: "🔴" }[phase.rag] ?? "⚪";
  const doneFeatures = phase.features.filter((f) => f.status === "concluida").length;

  const lines: string[] = [
    `## Contexto do step atual no roadmap: ${phase.fase}`,
    `Gate: ${phase.gate ?? "—"} | Janela: ${phase.janela ?? "—"} | Status: ${ragEmoji} ${phase.rag} | Progresso: ${doneFeatures}/${phase.features.length} features concluídas`,
  ];
  if (phase.foco) lines.push(`Foco: ${phase.foco}`);

  if (phase.features.length > 0) {
    lines.push("\n### Features desta fase");
    for (const f of phase.features) {
      const sym =
        { nao_iniciada: "○", em_andamento: "◑", concluida: "●", bloqueada: "✕" }[f.status] ?? "○";
      const lmTag = f.dependeLM ? " ⚠️LM" : "";
      const doneItems = f.checklist.filter((c) => c.done).length;
      const checkTag = f.checklist.length > 0 ? ` [${doneItems}/${f.checklist.length} ✓]` : "";
      lines.push(`- ${f.codigo} ${f.titulo} [${sym}${lmTag}${checkTag}]`);
    }
  }

  if (deps.length > 0) {
    lines.push("\n### Dependências do LM (desta fase)");
    for (const d of deps) {
      lines.push(`- ${d.codigo}: ${d.descricao} [${d.status}]${d.trilhoParalelo ? ` → trilho: ${d.trilhoParalelo}` : ""}`);
    }
  }

  if (risks.length > 0) {
    lines.push("\n### Riscos (desta fase)");
    for (const r of risks) {
      lines.push(`- ${r.codigo} [${r.severidade}]: ${r.descricao}`);
    }
  }

  if (decisions.length > 0) {
    lines.push("\n### Decisões desta fase");
    for (const d of decisions) {
      lines.push(`- ${d.decisao}${d.porque ? ` (${d.porque})` : ""}`);
    }
  }

  lines.push(
    "\nO analista está visualizando este step no roadmap. Responda no contexto desta fase — aponte gaps, riscos e próximas ações prioritárias.",
  );

  return lines.join("\n");
}

// ---- Memória viva gerada do banco (substitui o antigo 01_MEMORIA_PROJETO.md) ----

/**
 * Defaults estáticos das seções de texto livre. Usados quando não há ProjectNote
 * gravada (ex.: prod recém-deployado). O Nero sobrescreve via tool editar_memoria.
 */
const DEFAULT_NOTES: Record<string, string> = {
  metadados: [
    "| Campo | Valor |",
    "|---|---|",
    "| Projeto | Habilitação, Governança e Aculturamento — Data Lake LM |",
    "| Cliente | LM |",
    "| Executora | Blite/Venice Tech |",
    "| Duração | 6 meses |",
    "",
    "_(Fase atual e RAG geral são derivados do §6, abaixo.)_",
  ].join("\n"),
  resumo:
    "Apoiar a habilitação e o aculturamento das áreas de negócio do cliente LM no uso do Data Lake, com foco em autonomia no consumo de dados, governança/documentação dos ativos (catálogo, dicionário, glossário, ownership), boas práticas de consulta e cultura data-driven, deixando ao final um operating model sustentável e um roadmap de maturidade.",
  premissas:
    "_(Nenhuma premissa/pendência registrada. Registre com a ferramenta editar_memoria, seção `premissas`.)_",
  proximas_acoes:
    "_(Nenhuma ação de curto prazo registrada. Registre com editar_memoria, seção `proximas_acoes`.)_",
  glossario: [
    "| Termo | Definição |",
    "|---|---|",
    "| Owner de domínio | Responsável por validar e manter os ativos de um domínio de dados |",
    "| Trilho paralelo | Trabalho que avança sem depender do cliente |",
  ].join("\n"),
};

const RAG_EMOJI: Record<string, string> = {
  cinza: "⚪",
  amarelo: "🟡",
  verde: "🟢",
  vermelho: "🔴",
};

/**
 * Monta o bloco "ESTADO ATUAL DO PROJETO" inteiro (§0–§12) a partir do banco.
 * É a fonte da verdade injetada no system prompt do Nero a cada turno — substitui
 * o antigo arquivo estático 01_MEMORIA_PROJETO.md. Toda escrita de tool aparece aqui
 * na sessão seguinte, sem passo humano.
 */
export async function buildMemoriaContext(): Promise<string> {
  const [state, roadmap, notesRows, versions, maturity, catalog, biblioteca] = await Promise.all([
    loadProjectState(),
    loadRoadmap(),
    prisma.projectNote.findMany(),
    prisma.stateVersion.findMany({
      where: { desfeito: false },
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
    prisma.maturityAssessment.findMany({ orderBy: { ordem: "asc" } }),
    prisma.catalogAsset.findMany({
      orderBy: { ordem: "asc" },
      include: { campos: true },
    }),
    prisma.document.findMany({
      orderBy: { createdAt: "asc" },
      select: { titulo: true, tipo: true },
    }),
  ]);

  const note = (secao: string) =>
    notesRows.find((n) => n.secao === secao)?.conteudo ?? DEFAULT_NOTES[secao] ?? "—";

  // Mapa featureId → código (ex.: "F0.3"), para anotar riscos ligados a um epic.
  const featureCodeById = new Map<string, string>();
  for (const p of roadmap) for (const f of p.features) featureCodeById.set(f.id, f.codigo);

  const now = new Date();
  const L: string[] = [];
  L.push("# ================= ESTADO ATUAL DO PROJETO =================");
  L.push(
    "Esta é a **memória viva** do projeto — gerada automaticamente a partir do banco a cada " +
      "sessão. É a **fonte da verdade**. Suas ferramentas escrevem direto aqui e o resultado " +
      "aparece neste bloco na próxima sessão; **não há arquivo `.md` para manter nem re-upload**. " +
      "Se a conversa contradisser este estado, sinalize.\n",
  );

  L.push("## 0. Metadados\n" + note("metadados"));
  L.push("\n## 1. Resumo do projeto\n" + note("resumo"));

  // §2 Stack
  L.push("\n## 2. Stack & ambiente do Data Lake");
  if (state.stack.length) {
    L.push("| Item | Resposta | Status de verdade |", "|---|---|---|");
    for (const s of state.stack) {
      L.push(`| ${s.item} | ${s.resposta ?? "—"} | ${s.statusVerdade} |`);
    }
  } else L.push("_(vazio)_");

  // §3 Stakeholders
  L.push("\n## 3. Stakeholders & RACI");
  if (state.stakeholders.length) {
    L.push("| Nome | Papel | Lado | Responsabilidade |", "|---|---|---|---|");
    for (const s of state.stakeholders) {
      L.push(`| ${s.nome ?? "—"} | ${s.papel} | ${s.lado ?? "—"} | ${s.responsabilidade ?? "—"} |`);
    }
  } else L.push("_(vazio)_");

  // §4 Decisões
  L.push("\n## 4. Log de decisões");
  if (state.decisions.length) {
    for (const d of state.decisions) {
      const data = d.data.toISOString().slice(0, 10);
      L.push(`- ${data} — ${d.decisao}${d.porque ? ` (${d.porque})` : ""}${d.quem ? ` — ${d.quem}` : ""}`);
    }
  } else L.push("_(nenhuma decisão registrada)_");

  L.push("\n## 5. Premissas & decisões pendentes\n" + note("premissas"));

  // §6 Estado por fase (macro, com % derivado das features)
  L.push("\n## 6. Estado por fase / epic");
  L.push("| Fase | Status | % | Features | Comentário |", "|---|---|---|---|---|");
  for (const p of roadmap) {
    const emoji = RAG_EMOJI[p.rag] ?? "⚪";
    L.push(
      `| ${p.fase} | ${emoji} ${p.rag} | ${p.pctDerived}% | ${p.doneFeatures}/${p.totalFeatures} | ${p.comentario ?? ""} |`,
    );
  }

  // §7 Dependências do LM (aging calculado)
  L.push("\n## 7. 🔴 Dependências do Cliente LM (revisar toda sessão)");
  if (state.dependencies.length) {
    L.push("| # | O que precisamos | Solicitado | Status | Aging (dias úteis) | Trilho paralelo |", "|---|---|---|---|---|---|");
    for (const d of state.dependencies) {
      const aging = agingDias(d.solicitadoEm, now);
      const agingTxt = aging === null ? "—" : `${aging}${aging >= 5 ? " 🔴" : ""}`;
      const sol = d.solicitadoEm ? d.solicitadoEm.toISOString().slice(0, 10) : "—";
      L.push(`| ${d.codigo} | ${d.descricao} | ${sol} | ${d.status} | ${agingTxt} | ${d.trilhoParalelo ?? "—"} |`);
    }
  } else L.push("_(nenhuma dependência registrada)_");

  // §8 Riscos ativos
  L.push("\n## 8. Riscos & blockers");
  const riscosAtivos = state.risks.filter((r) => r.ativo);
  if (riscosAtivos.length) {
    L.push("| # | Risco/Blocker | Epic | Sev | Mitigação | Dono |", "|---|---|---|---|---|---|");
    for (const r of riscosAtivos) {
      const epic = r.featureId ? featureCodeById.get(r.featureId) ?? "—" : "(fase)";
      L.push(`| ${r.codigo} | ${r.descricao} | ${epic} | ${r.severidade} | ${r.mitigacao ?? "—"} | ${r.dono ?? "—"} |`);
    }
  } else L.push("_(nenhum risco ativo)_");

  L.push("\n## 9. Próximas ações (curto prazo)\n" + note("proximas_acoes"));

  // §10 Baseline
  L.push("\n## 10. Baseline de adoção");
  if (state.baseline.length) {
    L.push("| Métrica | Valor inicial | Atual | Data | Fonte |", "|---|---|---|---|---|");
    for (const b of state.baseline) {
      const data = b.data ? b.data.toISOString().slice(0, 10) : "—";
      L.push(`| ${b.metrica} | ${b.valorInicial ?? "—"} | ${b.atual ?? "—"} | ${data} | ${b.fonte ?? "—"} |`);
    }
  } else L.push("_(baseline não capturada)_");

  L.push("\n## 11. Glossário do projeto\n" + note("glossario"));

  // §12 Histórico recente — derivado da auditoria (StateVersion)
  L.push("\n## 12. Histórico recente (auditoria automática)");
  if (versions.length) {
    for (const v of versions) {
      const data = v.createdAt.toISOString().slice(0, 10);
      L.push(`- ${data} — ${v.resumo ?? `${v.operation} ${v.entity}`} _(${v.actor})_`);
    }
  } else L.push("_(sem alterações registradas)_");

  // §13 Maturidade DAMA — só quando houver avaliação real (disciplina de tokens).
  const maturityAvaliada = maturity.filter((m) => m.nivelAtual !== null || m.nivelMeta !== null);
  if (maturityAvaliada.length) {
    L.push("\n## 13. Maturidade DAMA (radar)");
    L.push("| Área | Atual | Meta | Status de verdade |", "|---|---|---|---|");
    for (const m of maturityAvaliada) {
      L.push(`| ${m.area} | ${m.nivelAtual ?? "—"} | ${m.nivelMeta ?? "—"} | ${m.statusVerdade} |`);
    }
  }

  // §14 Catálogo vivo — 1 linha por ativo, compacto (o dicionário completo NÃO entra no prompt).
  if (catalog.length) {
    L.push("\n## 14. Catálogo vivo (resumo)");
    L.push("| Ativo | Campos | Pronto | Sensibilidade | Status de verdade |", "|---|---|---|---|---|");
    for (const a of catalog) {
      const c = assetCompleteness(a, a.campos);
      L.push(
        `| ${a.nome} | ${a.campos.length} | ${c.pct}% | ${a.sensibilidade ?? "—"} | ${a.statusVerdade} |`,
      );
    }
  }

  // §15 Biblioteca — índice compacto (base de conhecimento consultável via tools).
  if (biblioteca.length) {
    L.push("\n## 15. Biblioteca (base de conhecimento do portal)");
    L.push(
      "Documentos que o Analista já produziu. Quando a pergunta puder ser respondida por eles " +
        "(processos, definições, políticas, decisões passadas), **use `consultar_biblioteca` para " +
        "buscar e `ler_documento` para o conteúdo completo — e cite o documento** em vez de responder " +
        "de memória.",
    );
    for (const d of biblioteca) L.push(`- [${d.tipo}] ${d.titulo}`);
  }

  // Marcadores de verdade
  L.push(
    "\n> Distinção teoria × realidade: o stack e a âncora DAMA são template/ideal até " +
      "**confirmados com o LM**. Marque premissas como pendência até validar; nunca trate " +
      "template como verdade.",
  );

  return L.join("\n");
}
