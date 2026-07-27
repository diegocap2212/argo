import { ArrowRight, Check, ChevronRight, Clock3, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useMySquads, type MySquad } from "@/hooks/useMySquads";
import { usePortalRole } from "@/hooks/usePortalRole";
import { CYCLE_JOURNEY, journeyStepOf, squadRouteFor, type CycleStatus } from "@/types/mma";

/**
 * Home adaptativa: as seções que existem dependem do papel de quem olha.
 *
 * O que ela conserta (relato de 2026-07-26: "salesforce vendas já testou, mas não
 * aparece pra mim que preciso homologar"):
 *   · a lista deixa de ser `slice(0, 3)` dos squads em que a pessoa é MEMBRO;
 *   · "Precisa de você" traz só o que espera a ação DESTE usuário, pelo papel dele;
 *   · o AM ganha a FILA DE HOMOLOGAÇÃO cross-squad, que antes não existia em lugar
 *     nenhum do produto — era o dado que faltava, não a permissão só.
 */

function formatQuarter(quarter: string | null) {
  if (!quarter) return "Ciclo atual";
  const match = quarter.match(/(\d{4})Q(\d)/);
  return match ? `Q${match[2]} ${match[1]}` : quarter;
}

/** O que ESTE usuário faz neste squad agora. Rótulo por etapa, não genérico. */
function actionLabel(status: CycleStatus | null): string {
  switch (status) {
    case null:
      return "Iniciar o assessment do quarter";
    case "pre_session":
      return "Registrar a análise prévia";
    case "session":
      return "Conduzir a sessão colaborativa";
    case "homologation":
      return "Homologar o pacote";
    case "official":
      return "Priorizar os kaizens";
    default:
      return "Ver o resultado do ciclo";
  }
}

/** Etapa em linguagem de status, para as listas de panorama. */
function stageLabel(status: CycleStatus | null): string {
  if (!status) return "Não iniciado";
  return CYCLE_JOURNEY[journeyStepOf(status)].label;
}

function SquadRow({ squad, note }: { squad: MySquad; note?: string }) {
  return (
    <Link to={squadRouteFor(squad.team_id, squad.cycle_status)} className="home-squad-row">
      <span className="home-squad-monogram">{squad.team_name.slice(0, 2).toUpperCase()}</span>
      <span>
        <strong>{squad.team_name}</strong>
        <small>
          {formatQuarter(squad.quarter)} · {note ?? stageLabel(squad.cycle_status)}
        </small>
      </span>
      <span className={squad.pending ? "is-pending" : "is-ok"}>
        {squad.pending ? "Requer atenção" : stageLabel(squad.cycle_status)}
      </span>
      <ChevronRight />
    </Link>
  );
}

export default function Inicio() {
  const { user } = useAuth();
  const { isAdmin, isAM } = usePortalRole();
  const { data: squads = [], isLoading } = useMySquads();

  const pending = squads.filter((s) => s.pending);
  const mine = squads.filter((s) => s.isMine);
  const homologationQueue = squads.filter((s) => s.cycle_status === "homologation");
  // Panorama para quem tem papel global: o que ele vê e não é dele.
  const others = squads.filter((s) => !s.isMine);

  // O foco da home é a primeira pendência REAL. Sem pendência, o primeiro squad próprio
  // (e, para quem só tem papel global, o primeiro da lista).
  const focus = pending[0] ?? mine[0] ?? squads[0];
  const focusStatus = focus?.cycle_status ?? null;
  const step = journeyStepOf(focusStatus);
  const name =
    user?.user_metadata?.full_name?.split(" ")[0] || user?.email?.split("@")[0] || "por aqui";

  return (
    <div className="home-editorial">
      <section className="home-hero">
        <div className="home-intro">
          <span className="editorial-eyebrow">Sua central de evolução</span>
          <h1>
            Olá,
            <br />
            <em>{name}.</em>
          </h1>
          <p>
            {pending.length
              ? `Você tem ${pending.length} ${pending.length === 1 ? "ação pendente" : "ações pendentes"}. O que precisa de você está no topo.`
              : squads.length
                ? "Nada pendente para você agora. Abaixo, o estado de cada squad que você acompanha."
                : "Quando você entrar em um squad, sua jornada, ações e evolução aparecerão aqui."}
          </p>
        </div>

        <article className="home-next-action">
          <div className="home-next-head">
            <span>Sua próxima ação</span>
            <strong>{formatQuarter(focus?.quarter ?? null)}</strong>
          </div>
          <h2>{focus ? actionLabel(focus.pending ? focusStatus : null) : "Conheça o modelo de maturidade"}</h2>
          <p>
            {focus
              ? `${focus.team_name} está na etapa de ${stageLabel(focusStatus).toLowerCase()}. Entre direto no ponto certo para continuar.`
              : "Explore os estágios e entenda como o portal transforma diagnóstico em evolução mensurável."}
          </p>
          <div
            className="home-progress"
            aria-label={`Etapa ${step + 1} de ${CYCLE_JOURNEY.length}`}
          >
            <span style={{ width: `${((step + 1) / CYCLE_JOURNEY.length) * 100}%` }} />
          </div>
          <div className="home-next-footer">
            <span>
              {step + 1}/{CYCLE_JOURNEY.length} etapas
            </span>
            <Link to={focus ? squadRouteFor(focus.team_id, focusStatus) : "/guia"}>
              Continuar <ArrowRight />
            </Link>
          </div>
        </article>
      </section>

      <section className="home-dashboard">
        <div className="home-primary-column">
          <div className="home-section-heading">
            <div>
              <span>Visão do ciclo</span>
              <h2>Jornada do squad</h2>
            </div>
            <span>{focus?.team_name ?? "seu squad"}</span>
          </div>

          <div className="home-journey">
            {CYCLE_JOURNEY.map((stage, index) => {
              const done = index < step;
              const active = index === step;
              return (
                <div
                  key={stage.status}
                  className={`home-journey-step ${done ? "is-done" : ""} ${active ? "is-active" : ""}`}
                >
                  <span className="home-step-dot">
                    {done ? <Check /> : String(index + 1).padStart(2, "0")}
                  </span>
                  <strong>{stage.label}</strong>
                  <small>{active ? "Etapa atual" : stage.detail}</small>
                </div>
              );
            })}
          </div>

          {/* A seção que responde ao relato. Só para quem homologa. */}
          {isAM && (
            <>
              <div className="home-section-heading home-squad-heading">
                <div>
                  <span>Aguardando homologação</span>
                  <h2>Fila do AM</h2>
                </div>
                <span>
                  {isLoading
                    ? "Carregando"
                    : `${homologationQueue.length} na fila`}
                </span>
              </div>
              <div className="home-squad-list">
                {homologationQueue.length ? (
                  homologationQueue.map((squad) => (
                    <SquadRow key={squad.team_id} squad={squad} note="Pacote fechado pelo SM" />
                  ))
                ) : (
                  <div className="home-empty">Nenhum pacote aguardando homologação.</div>
                )}
              </div>
            </>
          )}

          {mine.length > 0 && (
            <>
              <div className="home-section-heading home-squad-heading">
                <div>
                  <span>Seus contextos</span>
                  <h2>Meus squads</h2>
                </div>
                <span>{mine.length === 1 ? "1 squad" : `${mine.length} squads`}</span>
              </div>
              <div className="home-squad-list">
                {mine.map((squad) => (
                  <SquadRow key={squad.team_id} squad={squad} />
                ))}
              </div>
            </>
          )}

          {isAM && others.length > 0 && (
            <>
              <div className="home-section-heading home-squad-heading">
                <div>
                  <span>Panorama</span>
                  <h2>Todos os squads</h2>
                </div>
                <span>{others.length} squads</span>
              </div>
              <div className="home-squad-list">
                {others.map((squad) => (
                  <SquadRow key={squad.team_id} squad={squad} />
                ))}
              </div>
            </>
          )}

          {!isLoading && !squads.length && (
            <div className="home-empty">Nenhum squad associado à sua conta ainda.</div>
          )}
        </div>

        <aside className="home-attention">
          <div className="home-section-heading">
            <div>
              <span>Precisa de você</span>
              <h2>
                {pending.length} pendência{pending.length === 1 ? "" : "s"}
              </h2>
            </div>
            <span>Agora</span>
          </div>

          {pending.map((squad, index) => (
            <Link
              to={squadRouteFor(squad.team_id, squad.cycle_status)}
              className="home-pending-item"
              key={squad.team_id}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div>
                <strong>{actionLabel(squad.cycle_status)}</strong>
                <small>
                  {squad.team_name} · {formatQuarter(squad.quarter)}
                </small>
              </div>
              <ArrowRight />
            </Link>
          ))}

          {/* Estado explícito: "nada esperando VOCÊ" — não o antigo "Tudo certo", que
              aparecia igual para quem devia a pré-sessão e para quem não devia nada. */}
          {!pending.length && !isLoading && (
            <div className="home-empty-attention">
              Nada esperando você agora.
              {isAM && homologationQueue.length === 0 && " A fila de homologação está vazia."}
            </div>
          )}

          {isAdmin && (
            <div className="home-calendar-note">
              <ShieldCheck />
              <span>
                <strong>Administração</strong>
                <small>
                  <Link to="/admin">Squads, membros e papéis do portal</Link>
                </small>
              </span>
            </div>
          )}

          <div className="home-sync">
            <Clock3 /> Dados atualizados automaticamente
          </div>
        </aside>
      </section>
    </div>
  );
}
