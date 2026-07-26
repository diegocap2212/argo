import { NextRequest } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { streamTurn, resolveModel, type NeroMessage } from "@/lib/nero/core";
import { runNeroTool } from "@/lib/nero/tools";
import { costOfTurn } from "@/lib/nero/pricing";
import { prisma } from "@/lib/db";
import { loadPhase, buildPhaseContext } from "@/lib/state/queries";
import { loadTrilha, buildTutorContext } from "@/lib/academia/trilhas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Teto de turnos do laço agêntico. O último turno é reservado para o resumo de
// fechamento (sem ferramentas), então o trabalho real cabe em MAX_TURNS-1 turnos.
const MAX_TURNS = 8;

export async function POST(req: NextRequest) {
  let incoming: NeroMessage[];
  let faseSlug: string | undefined;
  let trilhaSlug: string | undefined;
  let stepSlug: string | undefined;
  let model: string;

  try {
    const body = await req.json();
    incoming = body.messages;
    faseSlug = typeof body.faseSlug === "string" ? body.faseSlug : undefined;
    trilhaSlug = typeof body.trilhaSlug === "string" ? body.trilhaSlug : undefined;
    stepSlug = typeof body.stepSlug === "string" ? body.stepSlug : undefined;
    // Valida contra a allowlist; qualquer coisa fora cai no modelo padrão.
    model = resolveModel(typeof body.model === "string" ? body.model : undefined);
    if (!Array.isArray(incoming) || incoming.length === 0) {
      return new Response("Corpo inválido: 'messages' é obrigatório.", { status: 400 });
    }
  } catch {
    return new Response("JSON inválido.", { status: 400 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(
      "ANTHROPIC_API_KEY não configurada. Defina-a em .env.local para usar o Nero.",
      { status: 500 },
    );
  }

  // Carrega contexto da fase se o chat for escopado a um step do roadmap.
  let scopeContext: string | undefined;
  if (faseSlug) {
    try {
      const detail = await loadPhase(faseSlug);
      if (detail) scopeContext = buildPhaseContext(detail);
    } catch (e) {
      console.error("[Nero] falha ao carregar contexto da fase:", e);
    }
  }

  // Chat tutor da Academia: injeta as regras didáticas (kit 10) + passo atual.
  if (!scopeContext && trilhaSlug && stepSlug) {
    try {
      const trilha = await loadTrilha(trilhaSlug);
      const step = trilha?.steps.find((s) => s.slug === stepSlug);
      if (trilha && step) scopeContext = await buildTutorContext(trilha, step);
    } catch (e) {
      console.error("[Nero] falha ao carregar contexto da trilha:", e);
    }
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (t: string) => controller.enqueue(encoder.encode(t));

      const messages: Anthropic.MessageParam[] = incoming.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      // Roda UM turno: transmite o texto, contabiliza o consumo, anexa a resposta
      // ao histórico e devolve a mensagem final. `tools: false` força um turno só
      // de texto (usado no fechamento, quando precisamos de um resumo garantido).
      const runTurn = async (opts: { tools?: boolean } = {}) => {
        const turnStream = await streamTurn(messages, {
          scopeContext,
          model,
          ...(opts.tools === false ? { tools: false } : {}),
        });

        for await (const event of turnStream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            emit(event.delta.text);
          }
        }

        const final = await turnStream.finalMessage();
        const u = final.usage;
        const usage = {
          inputTokens: u.input_tokens,
          outputTokens: u.output_tokens,
          cacheReadTokens: u.cache_read_input_tokens ?? 0,
          cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
        };
        const costUsd = costOfTurn(model, usage);
        try {
          await prisma.usageLog.create({ data: { model, ...usage, costUsd } });
        } catch (e) {
          // Não derruba o chat por causa do log, mas a falha PRECISA ficar visível:
          // se a persistência falhar, o medidor mostraria "zero" sem explicação.
          const detail = e instanceof Error ? e.message : String(e);
          console.error(
            `[Nero] FALHA AO PERSISTIR UsageLog (consumo NÃO contabilizado) — model=${model} custo=$${costUsd.toFixed(4)} tokens=${JSON.stringify(usage)} :: ${detail}`,
          );
        }
        messages.push({ role: "assistant", content: final.content });
        return final;
      };

      try {
        // `pendingWork` = saímos do laço ainda devendo trabalho (teto de turnos
        // atingido com ferramentas pendentes, ou resposta truncada por max_tokens).
        // Nesses casos o histórico termina numa mensagem do usuário, então um turno
        // final SEM ferramentas produz o resumo de fechamento que faltava.
        let pendingWork = false;

        for (let turn = 0; turn < MAX_TURNS; turn++) {
          const final = await runTurn();

          if (final.stop_reason === "tool_use") {
            const toolResults: Anthropic.ToolResultBlockParam[] = [];
            for (const block of final.content) {
              if (block.type === "tool_use") {
                const result = await runNeroTool(
                  block.name,
                  (block.input ?? {}) as Record<string, unknown>,
                );
                emit(`\n\n_↳ ${result}_\n`);
                toolResults.push({
                  type: "tool_result",
                  tool_use_id: block.id,
                  content: result,
                });
              }
            }
            messages.push({ role: "user", content: toolResults });
            if (turn === MAX_TURNS - 1) pendingWork = true;
            continue;
          }

          // Resposta cortada no meio pelo limite de tokens: empurra um nudge de
          // continuação (mensagem de usuário, p/ não cair em prefill) e segue.
          if (final.stop_reason === "max_tokens") {
            messages.push({
              role: "user",
              content: "(continue de onde parou, sem repetir, e finalize com um resumo)",
            });
            if (turn === MAX_TURNS - 1) pendingWork = true;
            continue;
          }

          // end_turn / stop_sequence: fechou naturalmente.
          break;
        }

        // Fechamento garantido: um turno sem ferramentas para o Nero resumir o que fez.
        if (pendingWork) {
          emit("\n\n");
          const closing = await runTurn({ tools: false });
          if (closing.stop_reason === "max_tokens") {
            emit(`\n\n_↳ Atingi o limite desta rodada. Peça "continuar" que eu retomo de onde parei._\n`);
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Erro desconhecido";
        emit(`\n\n[Erro do Nero: ${message}]`);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
