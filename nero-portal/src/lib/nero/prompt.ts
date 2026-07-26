import type Anthropic from "@anthropic-ai/sdk";
import { loadKit, type KitKey } from "./kit";
import { buildMemoriaContext } from "@/lib/state/queries";

/**
 * Monta o system prompt do Nero.
 *
 * Ordem importa para o prompt caching (prefixo estável primeiro, volátil depois):
 *  1. Bloco ESTÁVEL — instruções (00) + conhecimento de referência (02–09).
 *     Recebe cache_control: é o prefixo grande e fixo do projeto.
 *  2. Bloco de ESTADO — a memória viva, **gerada do banco** a cada turno
 *     (buildMemoriaContext). Fica por último, sem cache, como a fonte da verdade.
 *     Substitui o antigo arquivo estático 01_MEMORIA_PROJETO.md: agora o que o Nero
 *     escreve via tools aparece aqui sozinho, sem passo humano.
 */

// 00 = identidade/regras (vem primeiro). 02–09 = base de conhecimento.
const KNOWLEDGE_ORDER: KitKey[] = ["02", "03", "04", "05", "06", "07", "08", "09"];

export async function buildSystem(): Promise<Anthropic.TextBlockParam[]> {
  const [kit, memoria] = await Promise.all([loadKit(), buildMemoriaContext()]);

  const stable = [
    kit["00"],
    "\n\n# ================= BASE DE CONHECIMENTO DO PROJETO =================\n" +
      "Os documentos abaixo são referência (roadmap, processos, guardrails LGPD, âncora DAMA, " +
      "padrão de documentação). Lembre-se da distinção teoria × realidade: o DAMA e o Golden " +
      "Example são o ideal/template — o ambiente real do LM só se confirma no discovery.\n",
    ...KNOWLEDGE_ORDER.map((k) => kit[k]),
  ].join("\n\n---\n\n");

  return [
    { type: "text", text: stable, cache_control: { type: "ephemeral" } },
    { type: "text", text: memoria },
  ];
}
