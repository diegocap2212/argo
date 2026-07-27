import { NextRequest } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { streamTurn, resolveModel, MAX_TOKENS, type NeroMessage } from "@/lib/nero/core";
import { parseChatMessages } from "@/lib/nero/chat-input";
import { runNeroTool } from "@/lib/nero/tools";
import { isToolAllowed, scopeFromRequest } from "@/lib/nero/tool-policy";
import { costOfTurn } from "@/lib/nero/pricing";
import {
  BudgetExceededError,
  UserBudgetExceededError,
  assertWithinBudget,
  reserveTurn,
  settleTurn,
} from "@/lib/nero/usage";
import { acquireChatSlot } from "@/lib/nero/chat-slots";
import { currentActorEmail } from "@/lib/state/actor";
import { randomUUID } from "node:crypto";
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
    // Schema por mensagem + limites + alternância de papéis. Antes aqui só se checava
    // `Array.isArray && length > 0`, então o cliente podia forjar mensagens de `assistant`
    // (influenciando o tool use de um agente COM tools de escrita) e mandar histórico
    // ilimitado, queimando o orçamento global numa requisição. Ver lib/nero/chat-input.ts.
    const parsed = parseChatMessages(body.messages);
    if (!Array.isArray(parsed)) {
      return new Response(parsed.error, { status: parsed.status });
    }
    incoming = parsed;
  } catch {
    return new Response("JSON inválido.", { status: 400 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(
      "ANTHROPIC_API_KEY não configurada. Defina-a em .env.local para usar o Nero.",
      { status: 500 },
    );
  }

  // Identidade individual (do cookie NEO validado pelo proxy). Alimenta o teto por pessoa e
  // a coluna `actorEmail` do UsageLog — antes o orçamento era só global.
  const actorEmail = await currentActorEmail();

  // Escopo de ferramentas decidido pelo SERVIDOR a partir da rota. O chat tutor da Academia
  // recebia o conjunto INTEIRO e podia gravar decisão e sobrescrever o catálogo do projeto.
  const toolScope = scopeFromRequest({ trilhaSlug, stepSlug });

  // Freio de orçamento ANTES de abrir o stream: assim o estouro vira um 429 legível em vez
  // de um texto de erro dentro de uma resposta 200 (o streamTurn também barra, mas ali já
  // não há como mudar o status). Ver assertWithinBudget em lib/nero/usage.ts.
  try {
    await assertWithinBudget();
  } catch (e) {
    if (e instanceof BudgetExceededError) {
      return new Response(e.message, {
        status: 429,
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
      });
    }
    throw e;
  }

  // Concorrência por pessoa: o teto mensal não impede alguém abrir 20 abas e disparar 20
  // laços agênticos ao mesmo tempo (todos reservando antes de qualquer um reconciliar).
  // Guarda por instância — amortecedor de abuso acidental, não garantia distribuída.
  const release = acquireChatSlot(actorEmail);
  if (!release) {
    return new Response(
      "Você já tem conversas em andamento. Aguarde uma terminar antes de iniciar outra.",
      { status: 429, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } },
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
        // Reserva ANTES de abrir o stream: grava o custo máximo do turno para que
        // requisições concorrentes não leiam todas o mesmo saldo e passem juntas.
        const reservationId = await reserveTurn(model, MAX_TOKENS, actorEmail);
        const turnStream = await streamTurn(messages, {
          scopeContext,
          model,
          toolScope,
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
        // Troca a RESERVA pelo consumo real. Antes era um `create` solto: se falhasse, o
        // consumo simplesmente não entrava na conta e abria um buraco permanente no
        // orçamento. Agora a reserva conservadora já está contada e `settleTurn` a corrige —
        // uma falha aqui superestima o gasto, nunca o ignora.
        await settleTurn(reservationId, model, usage, costOfTurn(model, usage));
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
                // Barreira de EXECUÇÃO, não só de oferta. Filtrar a lista de tools impede o
                // modelo de conhecer a ferramenta; isto impede a execução mesmo se ele inventar
                // o nome — modelo alucina tool inexistente e repete tool de outro escopo.
                // Sem esta checagem, `runNeroTool` executava qualquer nome que chegasse aqui.
                if (!isToolAllowed(toolScope, block.name)) {
                  console.warn(
                    `[Nero] tool "${block.name}" BLOQUEADA no escopo "${toolScope}" (actor=${actorEmail ?? "anon"})`,
                  );
                  toolResults.push({
                    type: "tool_result",
                    tool_use_id: block.id,
                    content: `Ferramenta "${block.name}" não está disponível neste contexto.`,
                    is_error: true,
                  });
                  continue;
                }
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
        // Estouro de orçamento é mensagem de PRODUTO: o usuário precisa saber que o teto
        // fechou e o que fazer. O resto não: `err.message` cru aqui vazava nome de tabela,
        // constraint do Postgres, provider e request-id do Jira — e não só para o cliente,
        // porque este texto entra no stream que o próprio modelo lê nos turnos seguintes.
        const publico =
          err instanceof BudgetExceededError || err instanceof UserBudgetExceededError
            ? err.message
            : "Não consegui concluir esta rodada. O erro foi registrado; tente de novo em instantes.";
        const ref = randomUUID().slice(0, 8);
        console.error(`[Nero] falha no chat (ref=${ref}) actor=${actorEmail ?? "anon"}:`, err);
        emit(`\n\n[Nero: ${publico} (ref ${ref})]`);
      } finally {
        // Libera o slot de concorrência SEMPRE — fim normal, erro ou abort. Se vazar, a
        // pessoa fica travada até a instância reciclar.
        release();
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
