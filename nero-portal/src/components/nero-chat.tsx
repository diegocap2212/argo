"use client";

import { useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowRight, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { NeroLogo } from "@/components/nero-logo";
import { setLocalStorage, useLocalStorage } from "@/lib/use-local-storage";

type Message = { role: "user" | "assistant"; content: string };

// Modelos liberados (espelha a allowlist de core.ts; definido aqui para não
// arrastar o SDK da Anthropic pro bundle do cliente). Haiku 4.5 é o padrão.
const MODELS = [
  { id: "claude-haiku-4-5", label: "Haiku 4.5" },
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6" },
] as const;
const MODEL_STORAGE_KEY = "nero:model";

const SUGGESTIONS = [
  "Qual é o estado atual do projeto e o que está bloqueado?",
  "Quais dependências do LM estão vencendo (aging)?",
  "Gere o esqueleto do catálogo de uma tabela no padrão do Golden Example.",
  "O que preciso confirmar no discovery antes de avançar para a Fase 3?",
];

type ChatScope = {
  faseSlug?: string;
  // Escopo de aula da Academia (modo tutor): trilha + passo atual.
  trilhaSlug?: string;
  stepSlug?: string;
  label?: string;
  hint?: string; // texto do estado vazio (substitui o padrão da fase)
  suggestions?: string[]; // sugestões clicáveis específicas do escopo
};

export function NeroChat({ scope }: { scope?: ChatScope } = {}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Modelo escolhido pelo usuário, persistido por navegador. O servidor enxerga
  // o padrão (Haiku); o valor salvo entra no cliente sem mismatch de hidratação.
  const saved = useLocalStorage(MODEL_STORAGE_KEY, MODELS[0].id);
  const model = MODELS.some((m) => m.id === saved) ? (saved as string) : MODELS[0].id;

  function changeModel(id: string) {
    setLocalStorage(MODEL_STORAGE_KEY, id);
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    });
  }

  async function send(text: string) {
    const content = text.trim();
    if (!content || loading) return;

    const next: Message[] = [...messages, { role: "user", content }];
    setMessages([...next, { role: "assistant", content: "" }]);
    setInput("");
    setLoading(true);
    scrollToBottom();

    try {
      const body: Record<string, unknown> = { messages: next, model };
      if (scope?.faseSlug) body.faseSlug = scope.faseSlug;
      if (scope?.trilhaSlug && scope?.stepSlug) {
        body.trilhaSlug = scope.trilhaSlug;
        body.stepSlug = scope.stepSlug;
      }

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => "Falha na requisição.");
        appendToLast(errText || "Falha na requisição.");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        appendToLast(decoder.decode(value, { stream: true }));
        scrollToBottom();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro de rede";
      appendToLast(`\n\n[Erro: ${message}]`);
    } finally {
      setLoading(false);
      scrollToBottom();
      window.dispatchEvent(new Event("nero:usage-updated"));
    }
  }

  function appendToLast(chunk: string) {
    setMessages((prev) => {
      const copy = [...prev];
      const last = copy[copy.length - 1];
      if (last && last.role === "assistant") {
        copy[copy.length - 1] = { ...last, content: last.content + chunk };
      }
      return copy;
    });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  const empty = messages.length === 0;
  const isScoped = !!(scope?.faseSlug || scope?.trilhaSlug);
  const scopedSuggestions = scope?.suggestions ?? [];

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 py-6">
          {empty ? (
            <div className="mx-auto mt-8 flex max-w-xl flex-col items-center gap-5 text-center">
              <NeroLogo size={72} className="drop-shadow-md" />
              <div className="space-y-2">
                <h2 className="font-serif text-2xl font-semibold tracking-tight">Nero — Advisor de Dados</h2>
                {isScoped ? (
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Contexto:{" "}
                    <span className="font-medium text-foreground">
                      {scope?.label ?? scope?.faseSlug ?? scope?.trilhaSlug}
                    </span>
                    .{" "}
                    {scope?.hint ??
                      "Pergunte sobre esta fase, peça análise de riscos, ou solicite escritas no estado."}
                  </p>
                ) : (
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Motor central do portal de governança do Data Lake do LM. Atuo como guia da
                    operação e executo tarefas (docs no padrão DAMA, report quinzenal, atualização da
                    memória). Desafio decisões e aponto gaps — não só concordo.
                  </p>
                )}
              </div>
              {isScoped && scopedSuggestions.length > 0 && (
                <div className="grid w-full gap-2 text-left">
                  {scopedSuggestions.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="group flex items-center justify-between gap-2 rounded-xl border bg-card p-3 text-sm text-card-foreground transition-all hover:border-brand/40 hover:bg-accent"
                    >
                      <span>{s}</span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
                    </button>
                  ))}
                </div>
              )}
              {!isScoped && (
                <div className="grid w-full gap-2 text-left sm:grid-cols-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="group flex items-center justify-between gap-2 rounded-xl border bg-card p-3 text-sm text-card-foreground transition-all hover:border-brand/40 hover:bg-accent"
                    >
                      <span>{s}</span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              {messages.map((m, i) => (
                <MessageBubble key={i} message={m} loading={loading && i === messages.length - 1} />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="border-t bg-background/80 backdrop-blur">
        <div className="mx-auto w-full max-w-3xl px-4 py-3">
          <div className="flex items-end gap-2 rounded-2xl border bg-card p-1.5 shadow-sm focus-within:ring-2 focus-within:ring-brand/30">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={
                scope?.trilhaSlug
                  ? "Converse com o tutor sobre este passo…"
                  : isScoped
                    ? "Pergunte ao Nero sobre esta fase…"
                    : "Pergunte ao Nero ou peça uma tarefa…"
              }
              rows={1}
              className="max-h-40 min-h-[40px] resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
            />
            <Button
              size="icon"
              onClick={() => send(input)}
              disabled={loading || !input.trim()}
              className="h-9 w-9 shrink-0 rounded-xl"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>Modelo</span>
              <select
                value={model}
                onChange={(e) => changeModel(e.target.value)}
                className="rounded-md border bg-card px-1.5 py-0.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-brand/30"
              >
                {MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-xs text-muted-foreground">
              Enter envia · Shift+Enter quebra linha · Só metadados/schemas — nunca PII real (
              <a href="/privacidade" className="underline hover:text-foreground">
                LGPD
              </a>
              )
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ThinkingDots() {
  return (
    <span className="inline-flex items-center gap-1 text-muted-foreground">
      <span className="text-sm">Nero está pensando</span>
      <span className="ml-0.5 flex gap-0.5">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand [animation-delay:-0.3s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand [animation-delay:-0.15s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand" />
      </span>
    </span>
  );
}

function MessageBubble({ message, loading }: { message: Message; loading: boolean }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <NeroLogo size={32} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1 rounded-2xl rounded-tl-sm bg-muted px-4 py-3 text-sm">
        {message.content ? (
          <div className="prose prose-sm dark:prose-invert max-w-none prose-pre:bg-zinc-900 prose-pre:text-zinc-100">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
          </div>
        ) : loading ? (
          <ThinkingDots />
        ) : null}
      </div>
    </div>
  );
}
