import Link from "next/link";
import { Check, History, Database, Users, ClipboardList, ChevronRight } from "lucide-react";
import { loadPainel } from "@/lib/painel/queries";
import { loadProjectState } from "@/lib/state/queries";
import { listVersions } from "@/lib/state/mutations";
import { VersionHistory } from "@/components/version-history";
import { Blockers } from "@/components/painel/blockers";
import { RiskList } from "@/components/painel/risk-list";
import { ProjetoTabs } from "@/components/projeto-tabs";
import {
  STATUS_VERDADE_CLASS,
  STATUS_VERDADE_LABEL,
  isStatusVerdade,
} from "@/lib/state/provenance";

export const dynamic = "force-dynamic";

const fmtData = (d: Date | null) =>
  d ? new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

const RAG = {
  verde: { dot: "bg-success", fill: "bg-success", label: "no alvo" },
  amarelo: { dot: "bg-warning", fill: "bg-warning", label: "em andamento" },
  vermelho: { dot: "bg-error", fill: "bg-error", label: "em risco" },
  cinza: { dot: "bg-muted-foreground/40", fill: "bg-muted-foreground/40", label: "a iniciar" },
} as const;

function Tile({
  label,
  value,
  small,
  sub,
  tone,
}: {
  label: string;
  value: string;
  small?: string;
  sub: string;
  tone: "accent" | "ok" | "warn" | "crit";
}) {
  const stripe =
    tone === "crit" ? "bg-error" : tone === "warn" ? "bg-warning" : tone === "ok" ? "bg-success" : "bg-brand";
  return (
    <div className="relative overflow-hidden rounded-2xl border bg-card p-4 shadow-sm">
      <span className={`absolute inset-y-0 left-0 w-[3px] ${stripe}`} />
      <div className="text-[11.5px] font-semibold text-muted-foreground">{label}</div>
      <div className="mt-2 font-serif text-3xl font-semibold leading-none tracking-tight tabular-nums">
        {value}
        {small && <span className="ml-1 text-base font-medium text-muted-foreground">{small}</span>}
      </div>
      <div className="mt-1.5 text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}

function SectionHead({ children, count }: { children: React.ReactNode; count?: string }) {
  return (
    <div className="mb-3 flex items-baseline gap-3">
      <h2 className="font-serif text-xl font-semibold tracking-tight">{children}</h2>
      {count && <span className="font-mono text-xs text-muted-foreground">{count}</span>}
    </div>
  );
}

export default async function EstadoPage() {
  const painel = await loadPainel();
  const state = await loadProjectState();
  const versions = await listVersions(20);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 overflow-y-auto px-4 py-6">
      <ProjetoTabs />

      <div className="mb-6">
        <h1 className="font-serif text-2xl font-semibold tracking-tight">Data Lake LM — onde estamos hoje</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Retrato vivo do projeto: o que já andou, o que está travado esperando o LM, e para onde vamos.
          Cada fato carrega seu status de verdade — nada aqui é slide, tudo vem da operação real.
        </p>
      </div>

      {/* Pulso */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          tone="warn"
          label="Fase atual"
          value={painel.faseAtual.numeroLabel}
          sub={`${painel.faseAtual.nome} · ${painel.faseAtual.pct}%`}
        />
        <Tile
          tone="crit"
          label="Esperando o LM"
          value={String(painel.esperandoLM.total)}
          sub={`${painel.esperandoLM.criticos} em nível crítico (aging alto)`}
        />
        <Tile
          tone="crit"
          label="Riscos altos"
          value={String(painel.riscosAltos)}
          small={`/${painel.riscos.length}`}
          sub="ativos, com mitigação em curso"
        />
        <Tile
          tone="ok"
          label="Já entregue"
          value={String(painel.conquistas)}
          small="conquistas"
          sub="ambiente, acessos, documentação"
        />
      </div>

      {/* Jornada compacta */}
      <section className="mt-10">
        <SectionHead count="7 fases · 24 semanas">A jornada</SectionHead>
        <p className="mb-3 text-sm text-muted-foreground">
          Cada fase tem um gate de avanço. Clique numa fase para o painel 360° com features, checklist e riscos.
        </p>
        <div className="flex gap-2.5 overflow-x-auto pb-2">
          {painel.phases.map((p) => {
            const rag = RAG[p.rag as keyof typeof RAG] ?? RAG.cinza;
            return (
              <Link
                key={p.slug ?? p.numero}
                href={p.slug ? `/roadmap/${p.slug}` : "/roadmap"}
                className="group min-w-[150px] flex-1 rounded-xl border bg-card p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand/50"
              >
                <div className="flex items-center justify-between">
                  <span className={`h-3 w-3 rounded-full ${rag.dot}`} />
                  <span className="font-mono text-[11px] font-semibold text-muted-foreground">{p.gate}</span>
                </div>
                <div className="mt-2 text-[12.5px] font-semibold leading-tight">
                  Fase {p.numero} · {p.nome}
                </div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">{p.janela}</div>
                <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className={`h-full rounded-full ${rag.fill}`} style={{ width: `${p.pct}%` }} />
                </div>
                <div className="mt-1.5 font-mono text-[10.5px] text-muted-foreground">
                  {p.done}/{p.total} entregas · {p.pct}%
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Bloqueios — o herói */}
      <section className="mt-10">
        <SectionHead count={`${painel.esperandoLM.total} aguardando`}>
          Bloqueios aguardando o LM
        </SectionHead>
        <p className="mb-4 max-w-3xl text-sm text-muted-foreground">
          O projeto nunca para — cada item tem um trilho paralelo em andamento. Mas estes pontos dependem de uma
          decisão ou disponibilidade do LM para destravar de vez. O número é o tempo de espera em{" "}
          <span className="font-semibold text-foreground">dias úteis</span>. Clique para ver o que está sendo
          pedido e o que avança enquanto isso.
        </p>
        <Blockers blockers={painel.blockers} />
      </section>

      {/* Riscos + Conquistas */}
      <section className="mt-10 grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <SectionHead count={`${painel.riscos.length} · ${painel.riscosAltos} altos`}>
            Riscos ativos
          </SectionHead>
          <p className="mb-3 text-sm text-muted-foreground">
            Ordenados por severidade. Clique para ver a mitigação em curso.
          </p>
          <RiskList risks={painel.riscos} />
        </div>
        <div>
          <SectionHead>O que já destravamos</SectionHead>
          <p className="mb-3 text-sm text-muted-foreground">
            O discovery já rendeu resultado concreto — nada disso existia no começo.
          </p>
          <div className="rounded-xl border bg-card p-4 shadow-sm">
            {painel.wins.map((w, i) => (
              <div
                key={i}
                className="flex items-start gap-3 border-b py-2.5 last:border-0 first:pt-0 last:pb-0"
              >
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-success/15 text-success">
                  <Check className="h-3 w-3" />
                </span>
                <div>
                  <div className="text-[13px] font-semibold">{w.titulo}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{w.detalhe}</div>
                </div>
              </div>
            ))}
            {painel.wins.length === 0 && (
              <p className="text-sm text-muted-foreground">Ainda sem conquistas registradas.</p>
            )}
          </div>
        </div>
      </section>

      {/* Próximos passos */}
      {painel.next.length > 0 && (
        <section className="mt-10">
          <SectionHead>Próximos passos que dependem do LM</SectionHead>
          <div className="grid gap-3 sm:grid-cols-2">
            {painel.next.map((n, i) => (
              <div key={i} className="rounded-2xl border border-dashed bg-muted/30 p-4">
                <div className="flex items-center gap-2 font-serif text-base font-semibold">
                  <span className="h-2 w-2 rounded-full bg-brand" />
                  {n.titulo}
                </div>
                <p className="mt-1.5 text-[13px] text-muted-foreground">{n.detalhe}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Detalhes operacionais (recolhidos — para o analista, fora do caminho da apresentação) */}
      <section className="mt-12 space-y-3">
        <details className="group rounded-xl border bg-card">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium">
            <History className="h-4 w-4 text-brand" />
            Auditoria & desfazer
            <span className="ml-auto text-xs text-muted-foreground">{versions.length} alterações</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-90" />
          </summary>
          <div className="border-t px-4 py-3">
            <VersionHistory versions={versions} />
          </div>
        </details>

        <details className="group rounded-xl border bg-card">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium">
            <Database className="h-4 w-4 text-brand" />
            Stack & ambiente
            <span className="ml-auto text-xs text-muted-foreground">{state.stack.length} itens</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-90" />
          </summary>
          <div className="space-y-2 border-t px-4 py-3">
            {state.stack.map((s) => {
              const sv = isStatusVerdade(s.statusVerdade) ? s.statusVerdade : "lacuna";
              return (
                <div key={s.id} className="flex items-start justify-between gap-2 text-sm">
                  <span className="flex-1">{s.item}</span>
                  <span className="max-w-[45%] truncate text-xs text-muted-foreground">{s.resposta ?? "—"}</span>
                  <span
                    className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${STATUS_VERDADE_CLASS[sv]}`}
                  >
                    {STATUS_VERDADE_LABEL[sv]}
                  </span>
                </div>
              );
            })}
          </div>
        </details>

        <details className="group rounded-xl border bg-card">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium">
            <Users className="h-4 w-4 text-brand" />
            Stakeholders & RACI
            <span className="ml-auto text-xs text-muted-foreground">{state.stakeholders.length} pessoas</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-90" />
          </summary>
          <div className="grid gap-2 border-t px-4 py-3 sm:grid-cols-2">
            {state.stakeholders.map((s) => (
              <div key={s.id} className="rounded-lg border p-2 text-sm">
                <div className="font-medium">
                  {s.nome ?? "(a definir)"}
                  <span className="text-xs text-muted-foreground"> · {s.papel}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {s.lado ?? "—"}
                  {s.responsabilidade ? ` — ${s.responsabilidade}` : ""}
                </div>
              </div>
            ))}
          </div>
        </details>

        <details className="group rounded-xl border bg-card">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium">
            <ClipboardList className="h-4 w-4 text-brand" />
            Log de decisões
            <span className="ml-auto text-xs text-muted-foreground">{state.decisions.length} registros</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-90" />
          </summary>
          <div className="space-y-2 border-t px-4 py-3">
            {state.decisions.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma decisão registrada.</p>
            ) : (
              state.decisions.map((d) => (
                <div key={d.id} className="text-sm">
                  <span className="text-xs text-muted-foreground">{fmtData(d.data)}</span> — {d.decisao}
                  {d.quem && <span className="text-xs text-muted-foreground"> ({d.quem})</span>}
                </div>
              ))
            )}
          </div>
        </details>
      </section>
    </main>
  );
}
