import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { useTeamAnchors, useSyncAnchors } from "@/hooks/useAnchors";
import { useDimensions } from "@/hooks/useCycleData";
import { Button } from "@/components/ui/button";
import { cn, errMessage } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import type { Verdict } from "@/types/mma";
import { useTeamDashboardTarget } from "@/hooks/useTorreData";

// Portal NEO de origem única: o Dash vive em /dash na mesma origem — o iframe compartilha
// a sessão Supabase pelo localStorage, sem postMessage.
const LOCAVIA_BASE_URL = "/dash";

const VERDICT_LABEL: Record<Verdict, string> = {
  sustains: "sustenta",
  limit: "no limite",
  conflicts: "conflita",
  na: "n/a",
};

const VERDICT_CLASS: Record<Verdict, string> = {
  sustains: "bg-venice-okBg text-venice-okFg",
  limit: "bg-venice-warnBg text-venice-warnFg",
  conflicts: "bg-venice-errBg text-venice-errFg",
  na: "bg-venice-surface3 text-venice-textTertiary",
};

export default function Metricas() {
  const { teamId } = useParams<{ teamId: string }>();
  const { data: anchors = [], isLoading } = useTeamAnchors(teamId);
  const { data: dimensions = [] } = useDimensions();
  const { data: dashboardTarget, isLoading: dashboardLoading } = useTeamDashboardTarget(teamId);
  const sync = useSyncAnchors(teamId!);

  const locaviaUrl = dashboardTarget?.locaviaTeamId
    ? `${LOCAVIA_BASE_URL}/time/${encodeURIComponent(dashboardTarget.locaviaTeamId)}?embed=1`
    : null;

  const dimName = useMemo(() => new Map(dimensions.map((d) => [d.id, d.name])), [dimensions]);

  const lastSync = anchors
    .map((a) => a.read_at)
    .filter(Boolean)
    .sort()
    .at(-1);

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <h2 className="font-serif text-[19px]">Performance do time</h2>
            <p className="mt-1 text-sm text-venice-textTertiary">
              Fluxo, entrega, previsibilidade e qualidade diretamente do Dashboard Locavia.
            </p>
          </div>
          {locaviaUrl && (
            <Button asChild variant="outline" size="sm">
              <a href={locaviaUrl.replace("?embed=1", "")} target="_blank" rel="noreferrer">
                Abrir no Locavia <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </Button>
          )}
        </div>

        {dashboardLoading ? (
          <div className="p-8 text-center text-sm text-venice-textTertiary">Localizando dashboard do squad…</div>
        ) : locaviaUrl ? (
          <iframe
            title={`Dashboard Locavia · ${dashboardTarget?.name ?? "Squad"}`}
            src={locaviaUrl}
            className="h-[920px] w-full border-0 bg-background"
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : (
          <div className="p-8 text-center">
            <p className="text-sm font-medium">Dashboard Locavia ainda não mapeado para este squad.</p>
            <p className="mt-1 text-xs text-venice-textTertiary">Os squads produtivos conhecidos são mapeados automaticamente; novos squads precisam de um identificador do Locavia.</p>
          </div>
        )}
      </section>

      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-serif text-[19px]">Âncoras de dados</h2>
            <p className="mt-1 text-sm text-venice-textTertiary">
              Indicadores objetivos por dimensão — cruze com a nota de consenso antes de homologar.
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <div className="flex items-center gap-3">
              {lastSync && (
                <span className="whitespace-nowrap rounded-full bg-venice-okBg px-2.5 py-0.5 text-[11px] font-medium text-venice-okFg">
                  sincronizado
                </span>
              )}
              <Button
                variant="outline"
                disabled={sync.isPending}
                onClick={async () => {
                  try {
                    await sync.mutateAsync();
                    toast({ title: "Sincronizado", description: "Âncoras atualizadas diretamente a partir do Jira." });
                  } catch (e) {
                    toast({ title: "Erro ao sincronizar", description: errMessage(e), variant: "destructive" });
                  }
                }}
              >
                {sync.isPending ? "Sincronizando…" : "Sincronizar agora"}
              </Button>
            </div>
            {lastSync && (
              <span className="text-xs text-venice-textTertiary">{new Date(lastSync).toLocaleString("pt-BR")}</span>
            )}
          </div>
        </div>
      </div>

      {isLoading && <p className="text-sm text-venice-textTertiary">Carregando…</p>}

      {!isLoading && anchors.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-venice-textTertiary">
          Nenhuma âncora ativa para este squad ainda.
        </div>
      )}

      {anchors.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="grid grid-cols-[1.4fr_1.4fr_1fr_1fr] gap-4 px-5 py-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.07em] text-venice-textTertiary">Dimensão</span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.07em] text-venice-textTertiary">Âncora</span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.07em] text-venice-textTertiary">Valor atual</span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.07em] text-venice-textTertiary">Estado</span>
          </div>
          {anchors.map((a) => (
            <div
              key={a.id}
              className="grid grid-cols-[1.4fr_1.4fr_1fr_1fr] items-center gap-4 border-t border-dashed border-border px-5 py-3"
            >
              <span className="text-sm text-venice-textSecondary">{dimName.get(a.dimension_id) ?? "—"}</span>
              <span className="text-sm font-medium">{a.name}</span>
              <span className="font-mono text-xs">
                {a.value != null ? `${a.value.toFixed(1)}${a.unit ?? ""}` : "—"}
              </span>
              <span className={cn("w-fit rounded-full px-2.5 py-0.5 text-[11px] font-medium", VERDICT_CLASS[a.verdict])}>
                {VERDICT_LABEL[a.verdict]}
              </span>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-venice-textTertiary">
        As âncoras medem o sistema de trabalho — nunca as pessoas. Divergência entre a nota e o dado é sinal para
        conversa, não veredito automático.
      </p>
    </div>
  );
}
