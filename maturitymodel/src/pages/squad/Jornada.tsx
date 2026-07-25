import { useParams, Link } from "react-router-dom";
import { useLatestCycle, useStartCycle } from "@/hooks/useCycleData";
import { useSquadRole } from "@/hooks/useSquadRole";
import { CycleJourney } from "@/components/mma/CycleJourney";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { errMessage } from "@/lib/utils";
import type { CycleStatus } from "@/types/mma";

const STATUS_DESCRIPTION: Record<CycleStatus, string> = {
  pre_session: "Pré-sessão — o facilitador registra a análise prévia (estágio provisório + argumento) de cada dimensão antes da sessão com o time.",
  session: "Sessão colaborativa aberta — o facilitador apresenta cada dimensão e registra a nota de consenso do grupo.",
  homologation: "Pacote na fila do Agile Master — cada dimensão precisa ser homologada.",
  official: "Assessment oficial. As notas são imutáveis e o plano de evolução foi gerado.",
  archived: "Assessment arquivado.",
};

function currentQuarter(): string {
  const d = new Date();
  const q = Math.floor(d.getMonth() / 3) + 1;
  return `${d.getFullYear()}Q${q}`;
}

export default function Jornada() {
  const { teamId } = useParams<{ teamId: string }>();
  const { data: cycle, isLoading } = useLatestCycle(teamId);
  const role = useSquadRole(teamId);
  const startCycle = useStartCycle(teamId!);

  const canStart = role.isSM || role.isAM;
  const cycleIsCurrent = cycle?.quarter === currentQuarter();

  if (isLoading || role.isLoading) return <p className="text-sm text-venice-textTertiary">Carregando…</p>;

  if (!cycle || !cycleIsCurrent) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
        <p className="font-serif text-xl">Nenhum assessment em {currentQuarter()}</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-venice-textTertiary">
          {canStart
            ? "Inicie o assessment para abrir a pré-sessão: você registra sua análise prévia (estágio + argumento) das 10 dimensões e, ao concluir, abre a sessão colaborativa com o time."
            : "Aguarde o Scrum Master ou o Agile Master iniciar o assessment deste quarter."}
        </p>
        {canStart && (
          <Button
            variant="accent"
            className="mt-5"
            onClick={async () => {
              try {
                await startCycle.mutateAsync();
                toast({ title: "Assessment iniciado", description: "A pré-sessão está pronta para você preencher." });
              } catch (error) {
                toast({ title: "Não foi possível iniciar", description: errMessage(error), variant: "destructive" });
              }
            }}
            disabled={startCycle.isPending}
          >
            {startCycle.isPending ? "Iniciando…" : "Iniciar assessment"}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-serif text-3xl leading-tight tracking-[-0.015em]">
          Jornada do assessment · {cycle.quarter}
        </h2>
        <p className="mt-1 text-sm text-venice-textSecondary">{STATUS_DESCRIPTION[cycle.status]}</p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <CycleJourney teamId={teamId!} status={cycle.status} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Link to={`/s/${teamId}/sessao`} className="rounded-xl border border-border bg-card p-4 shadow-sm hover:border-venice-accent">
          <b className="text-sm font-semibold">Sessão</b>
          <p className="mt-1 text-xs text-venice-textTertiary">
            {canStart
              ? "Conduza a avaliação das 10 dimensões e feche as notas de consenso."
              : "Acompanhe a avaliação enquanto o facilitador conduz."}
          </p>
        </Link>
        {role.isAM && (
          <Link to={`/s/${teamId}/homologacao`} className="rounded-xl border border-border bg-card p-4 shadow-sm hover:border-venice-accent">
            <b className="text-sm font-semibold">Homologação</b>
            <p className="mt-1 text-xs text-venice-textTertiary">Revise as notas de consenso e oficialize o assessment.</p>
          </Link>
        )}
        <Link to={`/s/${teamId}/plano`} className="rounded-xl border border-border bg-card p-4 shadow-sm hover:border-venice-accent">
          <b className="text-sm font-semibold">Plano</b>
          <p className="mt-1 text-xs text-venice-textTertiary">Kaizens do quarter, gerados após a oficialização.</p>
        </Link>
        <Link to={`/s/${teamId}/comparativo`} className="rounded-xl border border-border bg-card p-4 shadow-sm hover:border-venice-accent">
          <b className="text-sm font-semibold">Comparativo</b>
          <p className="mt-1 text-xs text-venice-textTertiary">Evolução das notas quarter a quarter.</p>
        </Link>
      </div>
    </div>
  );
}
