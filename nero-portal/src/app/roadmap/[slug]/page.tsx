import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, AlertTriangle, ShieldAlert, CheckSquare, Lightbulb } from "lucide-react";
import { loadPhase } from "@/lib/state/queries";
import { agingDias, agingNivel } from "@/lib/state/aging";
import { FeatureChecklist } from "@/components/feature-checklist";
import { NeroChat } from "@/components/nero-chat";
import { NeroLogo } from "@/components/nero-logo";

export const dynamic = "force-dynamic";

const RAG_BADGE: Record<string, string> = {
  cinza: "bg-muted text-muted-foreground",
  amarelo: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  verde: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  vermelho: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

const RAG_LABEL: Record<string, string> = {
  cinza: "Não iniciada",
  amarelo: "Em andamento",
  verde: "Concluída",
  vermelho: "Bloqueada",
};

const AGING_COLORS: Record<string, string> = {
  ok: "text-green-600 dark:text-green-400",
  atencao: "text-yellow-600 dark:text-yellow-400",
  vermelho: "text-red-600 dark:text-red-400",
};

const SEV_CHIP: Record<string, string> = {
  Alta: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  Média: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  Baixa: "bg-muted text-muted-foreground",
};

export default async function PhasePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const detail = await loadPhase(slug);
  if (!detail) notFound();

  const { phase, deps, risks, decisions } = detail;
  const doneFeatures = phase.features.filter((f) => f.status === "concluida").length;
  const pctDerived =
    phase.features.length > 0
      ? Math.round((doneFeatures / phase.features.length) * 100)
      : 0;

  const now = new Date();

  // Riscos agrupados: por epic (mostrados dentro do card) vs. da fase inteira (faixa no header).
  const risksByFeature: Record<string, typeof risks> = {};
  const phaseRisks: typeof risks = [];
  for (const r of risks) {
    if (r.featureId) (risksByFeature[r.featureId] ??= []).push(r);
    else phaseRisks.push(r);
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      {/* Breadcrumb */}
      <Link
        href="/roadmap"
        className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Projeto · Fases
      </Link>

      {/* Header da fase */}
      <div className="mb-6 rounded-2xl border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-serif text-xl font-semibold tracking-tight">{phase.fase}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {phase.janela && <span>{phase.janela}</span>}
              {phase.gate && (
                <>
                  <span>·</span>
                  <span className="font-mono">{phase.gate}</span>
                </>
              )}
              {phase.foco && (
                <>
                  <span>·</span>
                  <span>{phase.foco}</span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span
              className={`rounded-full px-3 py-1 text-sm font-medium ${RAG_BADGE[phase.rag] ?? RAG_BADGE.cinza}`}
            >
              {RAG_LABEL[phase.rag] ?? phase.rag}
            </span>
            <span className="text-lg font-semibold">{pctDerived}%</span>
          </div>
        </div>

        {/* Barra de progresso geral */}
        {phase.features.length > 0 && (
          <div className="mt-4">
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>Progresso</span>
              <span>{doneFeatures}/{phase.features.length} features</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-brand transition-all"
                style={{ width: `${pctDerived}%` }}
              />
            </div>
          </div>
        )}

        {phase.comentario && (
          <p className="mt-3 text-sm text-muted-foreground border-t pt-3">{phase.comentario}</p>
        )}

        {/* Riscos da fase inteira (os de epic aparecem dentro de cada card) */}
        {phaseRisks.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t pt-3">
            <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
              <ShieldAlert className="h-3.5 w-3.5" />
              Riscos da fase:
            </span>
            {phaseRisks.map((r) => (
              <span
                key={r.id}
                title={r.mitigacao ? `${r.descricao} · Mitigação: ${r.mitigacao}` : r.descricao}
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${SEV_CHIP[r.severidade] ?? SEV_CHIP.Baixa}`}
              >
                {r.codigo} · {r.descricao} · {r.severidade}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Layout 2 colunas: painel 360° + Chat Nero */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_400px]">
        {/* Coluna esquerda: epics (com riscos inline) + deps/decisões recolhidos */}
        <div className="space-y-6">
          {/* Features */}
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              <CheckSquare className="h-4 w-4" />
              Features & checklist
            </h2>
            <FeatureChecklist features={phase.features} slug={slug} risksByFeature={risksByFeature} />
          </section>

          {/* Contexto secundário recolhido — não compete com os epics */}
          {(deps.length > 0 || decisions.length > 0) && (
            <div className="space-y-2">
              {/* Dependências do LM (colapsável) */}
              {deps.length > 0 && (
                <details className="rounded-xl border bg-card">
                  <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-medium select-none">
                    <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                    Dependências do LM
                    <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {deps.length}
                    </span>
                  </summary>
                  <div className="space-y-2 border-t p-3">
                    {deps.map((d) => {
                      const dias = agingDias(d.solicitadoEm, now);
                      const nivel = agingNivel(dias);
                      return (
                        <div key={d.id} className="rounded-lg border bg-background p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs text-muted-foreground">{d.codigo}</span>
                                <span className="text-sm font-medium">{d.descricao}</span>
                              </div>
                              {d.trilhoParalelo && (
                                <p className="mt-1 text-xs text-muted-foreground">
                                  <span className="font-medium">Trilho:</span> {d.trilhoParalelo}
                                </p>
                              )}
                            </div>
                            <div className="flex shrink-0 flex-col items-end gap-1">
                              <span
                                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                  d.status === "recebido"
                                    ? "bg-green-100 text-green-700"
                                    : d.status === "cancelado"
                                    ? "bg-muted text-muted-foreground"
                                    : "bg-yellow-100 text-yellow-700"
                                }`}
                              >
                                {d.status}
                              </span>
                              {dias !== null && d.status === "aguardando" && (
                                <span className={`text-xs font-medium ${AGING_COLORS[nivel]}`}>
                                  {dias}d úteis
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </details>
              )}

              {/* Decisões desta fase (colapsável) */}
              {decisions.length > 0 && (
                <details className="rounded-xl border bg-card">
                  <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-medium select-none">
                    <Lightbulb className="h-4 w-4 text-muted-foreground" />
                    Decisões desta fase
                    <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {decisions.length}
                    </span>
                  </summary>
                  <div className="space-y-2 border-t p-3">
                    {decisions.map((d) => (
                      <div key={d.id} className="rounded-lg border bg-background p-3">
                        <p className="text-sm font-medium">{d.decisao}</p>
                        {d.porque && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            <span className="font-medium">Por quê:</span> {d.porque}
                          </p>
                        )}
                        <p className="mt-1 text-xs text-muted-foreground">
                          {new Date(d.data).toLocaleDateString("pt-BR")}
                          {d.quem && ` · ${d.quem}`}
                        </p>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </div>

        {/* Coluna direita: Nero contextual */}
        <div className="flex flex-col rounded-2xl border bg-card overflow-hidden lg:h-[calc(100vh-10rem)] lg:sticky lg:top-20">
          <div className="border-b px-4 py-3">
            <div className="flex items-center gap-2">
              <NeroLogo size={24} />
              <span className="text-sm font-medium">Nero · contexto desta fase</span>
            </div>
          </div>
          <NeroChat
            scope={{
              faseSlug: slug,
              label: phase.fase,
            }}
          />
        </div>
      </div>
    </div>
  );
}
