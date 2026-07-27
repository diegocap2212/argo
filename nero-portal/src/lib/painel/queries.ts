import { prisma } from "@/lib/db";
import { agingDias, agingNivel, type AgingNivel } from "@/lib/state/aging";
import { loadProjectState, loadRoadmap } from "@/lib/state/queries";

/**
 * Deriva o "Painel do Projeto" (Visão geral) a partir do estado vivo — a leitura
 * de apresentação para stakeholders: pulso, jornada, bloqueios aguardando o LM,
 * riscos, conquistas e próximos passos. Dedupe defensivo por código (o log de
 * riscos/decisões era append-only e pode ter repetições históricas).
 */

export type PainelBlocker = {
  codigo: string;
  descricao: string;
  decisaoPedida: string | null;
  trilhoParalelo: string | null;
  agingDias: number | null;
  nivel: AgingNivel;
};

export type PainelRisk = {
  codigo: string;
  descricao: string;
  severidade: string;
  mitigacao: string | null;
  dono: string | null;
};

export type PainelPhase = {
  slug: string | null;
  numero: number;
  nome: string;
  gate: string | null;
  janela: string | null;
  foco: string | null;
  rag: string;
  pct: number;
  done: number;
  total: number;
};

export type PainelWin = { titulo: string; detalhe: string };
export type PainelNext = { titulo: string; detalhe: string };

export type Painel = {
  faseAtual: { nome: string; numeroLabel: string; pct: number };
  esperandoLM: { total: number; criticos: number };
  riscos: PainelRisk[];
  riscosAltos: number;
  blockers: PainelBlocker[];
  phases: PainelPhase[];
  wins: PainelWin[];
  next: PainelNext[];
  conquistas: number;
};

const SEV_RANK: Record<string, number> = { Alta: 0, ["Média"]: 1, Baixa: 2 };

export async function loadPainel(): Promise<Painel> {
  const [state, roadmap, docCount] = await Promise.all([
    loadProjectState(),
    loadRoadmap(),
    prisma.document.count(),
  ]);

  // ---- Fases (jornada) ----
  const phases: PainelPhase[] = roadmap.map((p, i) => {
    const partes = p.fase.split("—");
    const nome = (partes[1] ?? partes[0] ?? p.fase).trim();
    return {
      slug: p.slug,
      numero: i,
      nome,
      gate: p.gate,
      janela: p.janela,
      foco: p.foco,
      rag: p.rag,
      pct: p.pctDerived,
      done: p.doneFeatures,
      total: p.totalFeatures,
    };
  });

  const ativa =
    roadmap.find((p) => p.rag === "amarelo") ??
    roadmap.find((p) => p.rag !== "cinza" && p.pctDerived < 100) ??
    roadmap.find((p) => p.rag !== "cinza") ??
    roadmap[0];
  const ativaIdx = ativa ? roadmap.indexOf(ativa) : 0;
  const faseAtual = {
    nome: ativa ? (ativa.fase.split("—")[1] ?? ativa.fase).trim() : "—",
    numeroLabel: `Fase ${ativaIdx}${ativaIdx < roadmap.length - 1 ? " → " + (ativaIdx + 1) : ""}`,
    pct: ativa?.pctDerived ?? 0,
  };

  // ---- Bloqueios (dependências aguardando, ordenadas por aging desc) ----
  const blockers: PainelBlocker[] = state.dependencies
    .filter((d) => d.status === "aguardando")
    .map((d) => {
      const dias = agingDias(d.solicitadoEm);
      return {
        codigo: d.codigo,
        descricao: d.descricao,
        decisaoPedida: d.decisaoPedida,
        trilhoParalelo: d.trilhoParalelo,
        agingDias: dias,
        nivel: agingNivel(dias),
      };
    })
    .sort((a, b) => (b.agingDias ?? -1) - (a.agingDias ?? -1));

  const criticos = blockers.filter((b) => b.nivel === "vermelho").length;

  // ---- Riscos (dedupe por código, ativos, por severidade) ----
  const seen = new Set<string>();
  const riscos: PainelRisk[] = state.risks
    .filter((r) => r.ativo)
    .filter((r) => (seen.has(r.codigo) ? false : (seen.add(r.codigo), true)))
    .map((r) => ({
      codigo: r.codigo,
      descricao: r.descricao,
      severidade: r.severidade,
      mitigacao: r.mitigacao,
      dono: r.dono,
    }))
    .sort((a, b) => (SEV_RANK[a.severidade] ?? 9) - (SEV_RANK[b.severidade] ?? 9));
  const riscosAltos = riscos.filter((r) => r.severidade === "Alta").length;

  // ---- Conquistas (derivadas do estado estruturado) ----
  const wins: PainelWin[] = [];
  const confirmados = state.stack.filter((s) => s.statusVerdade === "confirmado").length;
  const maisAvancada = [...roadmap].sort((a, b) => b.pctDerived - a.pctDerived)[0];
  if (maisAvancada && maisAvancada.pctDerived > 0) {
    wins.push({
      titulo: `${(maisAvancada.fase.split("—")[1] ?? maisAvancada.fase).trim()} a ${maisAvancada.pctDerived}%`,
      detalhe: `${maisAvancada.doneFeatures} de ${maisAvancada.totalFeatures} entregas concluídas.`,
    });
  }
  if (confirmados > 0) {
    wins.push({
      titulo: `${confirmados} aspectos do ambiente confirmados`,
      detalhe: "Stack, camadas, acessos e processos validados no discovery — status de verdade “confirmado”.",
    });
  }
  const recebidas = state.dependencies.filter((d) => d.status === "recebido");
  if (recebidas.length > 0) {
    wins.push({
      titulo: `${recebidas.length} dependência(s) do LM já recebida(s)`,
      detalhe: recebidas.map((d) => d.codigo).join(", ") + " — destravadas pelo cliente.",
    });
  }
  if (docCount > 0) {
    wins.push({
      titulo: `${docCount} documentos publicados`,
      detalhe: "Base de conhecimento no ar na Biblioteca — guias, políticas e mapeamentos.",
    });
  }

  // ---- Próximos passos que dependem do LM ----
  const next: PainelNext[] = [];
  const baselineVazio = state.baseline.every((b) => !b.atual || b.atual === "0" || b.atual === "—");
  if (baselineVazio) {
    next.push({
      titulo: "Baseline de adoção",
      detalhe: "Usuários ativos, volume de queries e tickets ainda não capturados — sem o ponto de partida não dá para medir evolução. Destrava com o acesso aos logs de uso.",
    });
  }
  const maturityAvaliada = await prisma.maturityAssessment.count({
    where: { OR: [{ nivelAtual: { not: null } }, { nivelMeta: { not: null } }] },
  });
  if (maturityAvaliada === 0) {
    next.push({
      titulo: "Maturidade DAMA",
      detalhe: "As 11 áreas da Roda DAMA ainda não foram pontuadas (1–5). A avaliação sai da sessão de discovery e vira o radar de “onde estamos vs. onde queremos chegar”.",
    });
  }

  return {
    faseAtual,
    esperandoLM: { total: blockers.length, criticos },
    riscos,
    riscosAltos,
    blockers,
    phases,
    wins,
    next,
    conquistas: wins.length,
  };
}
