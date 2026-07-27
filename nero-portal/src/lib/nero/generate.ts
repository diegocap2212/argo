import { streamTurn, resolveModel } from "./core";
import { costOfTurn } from "./pricing";
import { prisma } from "@/lib/db";
import type { ReportData, SaudeFrente } from "@/lib/report/build";

/**
 * Geração one-shot via Nero Core (o ÚNICO ponto de IA): um turno, sem tools,
 * sem loop agêntico. Usado pelas seções narrativas do report quinzenal.
 * Contabiliza UsageLog como o /api/chat.
 */
async function generateOnce(prompt: string, model?: string): Promise<string> {
  const resolved = resolveModel(model);
  const stream = await streamTurn([{ role: "user", content: prompt }], {
    tools: false,
    model: resolved,
  });
  const final = await stream.finalMessage();

  const u = final.usage;
  const usage = {
    inputTokens: u.input_tokens,
    outputTokens: u.output_tokens,
    cacheReadTokens: u.cache_read_input_tokens ?? 0,
    cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
  };
  const costUsd = costOfTurn(resolved, usage);
  try {
    await prisma.usageLog.create({ data: { model: resolved, ...usage, costUsd } });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error(
      `[Nero] FALHA AO PERSISTIR UsageLog (geração de report) — model=${resolved} custo=$${costUsd.toFixed(4)} :: ${detail}`,
    );
  }

  return final.content
    .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("");
}

export type ReportNarrativa = {
  sumarioExecutivo: string;
  notaAdvisor: string;
  saudeFrentes: SaudeFrente[];
  statusGeral: "verde" | "amarelo" | "vermelho";
};

/** Extrai o primeiro objeto JSON de um texto (o modelo pode envolver em prosa/fences). */
function extractJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const v = JSON.parse(text.slice(start, end + 1));
    return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Pede ao Nero as seções narrativas do report (§1 sumário, §9 saúde, §10 nota
 * do advisor + status geral). Se a chamada ou o parse falharem, cai nos
 * defaults determinísticos — o report NUNCA deixa de ser gerado por causa da IA.
 */
export async function generateReportNarrative(
  data: ReportData,
  opts: { model?: string } = {},
): Promise<{ narrativa: ReportNarrativa; geradaPorIA: boolean }> {
  const fallback: ReportNarrativa = {
    sumarioExecutivo:
      `Quinzena com ${data.entregas.length} entrega(s) concluída(s) e ` +
      `${data.emAndamento.length} frente(s) em andamento na ${data.faseAtual}. ` +
      `${data.blockers.length} dependência(s) do LM aguardando` +
      `${data.blockers.some((b) => b.agingNivel === "vermelho") ? " — há itens com aging crítico que precisam de destravamento" : ""}.`,
    notaAdvisor:
      "_(Nota do advisor não gerada — narrativa automática indisponível nesta geração.)_",
    saudeFrentes: data.saudeFrentes,
    statusGeral: data.statusGeralDefault,
  };

  if (!process.env.ANTHROPIC_API_KEY) return { narrativa: fallback, geradaPorIA: false };

  const prompt = [
    "Gere as seções NARRATIVAS do report quinzenal (kit 04) a partir do JSON estruturado abaixo,",
    "que já foi montado a partir do estado vivo do projeto. Não invente fatos: use somente o que",
    "está no JSON e o estado do projeto que você conhece. Tom executivo, pt-BR, franco.",
    "",
    "Responda APENAS com um objeto JSON válido, sem markdown, neste formato:",
    "{",
    '  "sumarioExecutivo": "3-5 linhas: o que um diretor precisa ler em 30 segundos",',
    '  "notaAdvisor": "leitura técnica franca do advisor: gap percebido, correção sugerida ou alerta",',
    '  "saudeFrentes": [{"frente": "Escopo/Roadmap|Prazo|Dependências LM|Qualidade das entregas", "rag": "verde|amarelo|vermelho", "comentario": "..."}],',
    '  "statusGeral": "verde|amarelo|vermelho"',
    "}",
    "",
    "Dados estruturados da quinzena:",
    JSON.stringify(data),
  ].join("\n");

  try {
    const text = await generateOnce(prompt, opts.model);
    const json = extractJson(text);
    if (!json) return { narrativa: fallback, geradaPorIA: false };

    const rags = ["verde", "amarelo", "vermelho"];
    const saude = Array.isArray(json.saudeFrentes)
      ? (json.saudeFrentes as Array<Record<string, unknown>>)
          .filter((f) => f && typeof f.frente === "string" && rags.includes(String(f.rag)))
          .map((f) => ({
            frente: String(f.frente),
            rag: String(f.rag) as SaudeFrente["rag"],
            comentario: String(f.comentario ?? ""),
          }))
      : [];

    return {
      narrativa: {
        sumarioExecutivo:
          typeof json.sumarioExecutivo === "string" && json.sumarioExecutivo.trim()
            ? json.sumarioExecutivo
            : fallback.sumarioExecutivo,
        notaAdvisor:
          typeof json.notaAdvisor === "string" && json.notaAdvisor.trim()
            ? json.notaAdvisor
            : fallback.notaAdvisor,
        saudeFrentes: saude.length ? saude : fallback.saudeFrentes,
        statusGeral: rags.includes(String(json.statusGeral))
          ? (String(json.statusGeral) as ReportNarrativa["statusGeral"])
          : fallback.statusGeral,
      },
      geradaPorIA: true,
    };
  } catch (e) {
    console.error("[Nero] geração narrativa do report falhou; usando fallback:", e);
    return { narrativa: fallback, geradaPorIA: false };
  }
}
