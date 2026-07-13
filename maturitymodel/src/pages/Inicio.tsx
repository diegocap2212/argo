import { ArrowRight, CalendarDays, Check, ChevronRight, Clock3 } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useMySquads } from "@/hooks/useMySquads";
import type { CycleStatus } from "@/types/mma";

const journey: Array<{ label: string; status: CycleStatus[]; detail: string }> = [
  { label: "Sessão", status: ["session"], detail: "Discussão colaborativa" },
  { label: "Homologação", status: ["homologation"], detail: "Revisão do AM" },
  { label: "Plano", status: ["official"], detail: "Kaizens priorizados" },
  { label: "Evolução", status: ["archived"], detail: "Resultado do ciclo" },
];

function formatQuarter(quarter: string | null) {
  if (!quarter) return "Ciclo atual";
  const match = quarter.match(/(\d{4})Q(\d)/);
  return match ? `Q${match[2]} ${match[1]}` : quarter;
}

export default function Inicio() {
  const { user } = useAuth();
  const { data: squads = [], isLoading } = useMySquads();
  const activeSquad = squads.find((s) => s.pending) ?? squads[0];
  const currentStatus: CycleStatus = activeSquad?.cycle_status ?? "session";
  const activeIndex = Math.max(0, journey.findIndex((step) => step.status.includes(currentStatus)));
  const name = user?.user_metadata?.full_name?.split(" ")[0] || user?.email?.split("@")[0] || "por aqui";
  const squadName = activeSquad?.team_name ?? "seu squad";
  const actionPath = activeSquad ? `/s/${activeSquad.team_id}${currentStatus === "session" ? "/sessao" : currentStatus === "homologation" ? "/homologacao" : ""}` : "/guia";
  const pendingSquads = squads.filter((s) => s.pending);

  return (
    <div className="home-editorial">
      <section className="home-hero">
        <div className="home-intro">
          <span className="editorial-eyebrow">Sua central de evolução</span>
          <h1>Bom dia,<br /><em>{name}.</em></h1>
          <p>{activeSquad
            ? `A evolução da ${squadName} está em movimento. Veja o que merece sua atenção e avance o ciclo sem perder o contexto.`
            : "Quando você entrar em um squad, sua jornada, ações e evolução aparecerão aqui."}</p>
        </div>

        <article className="home-next-action">
          <div className="home-next-head">
            <span>Sua próxima ação</span>
            <strong>{formatQuarter(activeSquad?.quarter ?? null)}</strong>
          </div>
          <h2>{activeSquad ? "Continue o ciclo do seu squad" : "Conheça o modelo de maturidade"}</h2>
          <p>{activeSquad
            ? `O ciclo está na etapa de ${journey[activeIndex].label.toLowerCase()}. Entre direto no ponto certo para continuar.`
            : "Explore os estágios e entenda como o portal transforma diagnóstico em evolução mensurável."}</p>
          <div className="home-progress" aria-label={`Etapa ${activeIndex + 1} de ${journey.length}`}>
            <span style={{ width: `${((activeIndex + 1) / journey.length) * 100}%` }} />
          </div>
          <div className="home-next-footer">
            <span>{activeIndex + 1}/{journey.length} etapas</span>
            <Link to={actionPath}>Continuar <ArrowRight /></Link>
          </div>
        </article>
      </section>

      <section className="home-dashboard">
        <div className="home-primary-column">
          <div className="home-section-heading">
            <div><span>Visão do ciclo</span><h2>Jornada do squad</h2></div>
            <span>{squadName}</span>
          </div>

          <div className="home-journey">
            {journey.map((step, index) => {
              const done = index < activeIndex;
              const active = index === activeIndex;
              return (
                <div key={step.label} className={`home-journey-step ${done ? "is-done" : ""} ${active ? "is-active" : ""}`}>
                  <span className="home-step-dot">{done ? <Check /> : String(index + 1).padStart(2, "0")}</span>
                  <strong>{step.label}</strong>
                  <small>{active ? "Etapa atual" : step.detail}</small>
                </div>
              );
            })}
          </div>

          <div className="home-section-heading home-squad-heading">
            <div><span>Seus contextos</span><h2>Squads</h2></div>
            <span>{isLoading ? "Carregando" : `${squads.length} ${squads.length === 1 ? "squad" : "squads"}`}</span>
          </div>
          <div className="home-squad-list">
            {squads.length ? squads.slice(0, 3).map((squad) => (
              <Link to={`/s/${squad.team_id}`} key={squad.team_id} className="home-squad-row">
                <span className="home-squad-monogram">{squad.team_name.slice(0, 2).toUpperCase()}</span>
                <span><strong>{squad.team_name}</strong><small>{formatQuarter(squad.quarter)} · {squad.pending ? "Ação pendente" : "Em dia"}</small></span>
                <span className={squad.pending ? "is-pending" : "is-ok"}>{squad.pending ? "Requer atenção" : "Tudo certo"}</span>
                <ChevronRight />
              </Link>
            )) : (
              <div className="home-empty">Nenhum squad associado à sua conta ainda.</div>
            )}
          </div>
        </div>

        <aside className="home-attention">
          <div className="home-section-heading">
            <div><span>Prioridades</span><h2>{pendingSquads.length || (activeSquad ? 1 : 0)} pendência{pendingSquads.length === 1 ? "" : "s"}</h2></div>
            <span>Agora</span>
          </div>
          {(pendingSquads.length ? pendingSquads : activeSquad ? [activeSquad] : []).slice(0, 3).map((squad, index) => (
            <Link to={`/s/${squad.team_id}${squad.cycle_status === "session" ? "/sessao" : squad.cycle_status === "homologation" ? "/homologacao" : ""}`} className="home-pending-item" key={squad.team_id}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div><strong>{squad.cycle_status === "session" ? "Continuar sessão colaborativa" : squad.cycle_status === "homologation" ? "Revisar homologação" : "Continuar a jornada do ciclo"}</strong><small>{squad.team_name} · {formatQuarter(squad.quarter)}</small></div>
              <ArrowRight />
            </Link>
          ))}
          {!activeSquad && <div className="home-empty-attention">Você não possui ações pendentes.</div>}
          <div className="home-calendar-note"><CalendarDays /><span><strong>Próximo marco</strong><small>Confira a agenda do ciclo dentro do seu squad.</small></span></div>
          <div className="home-sync"><Clock3 /> Dados atualizados automaticamente</div>
        </aside>
      </section>
    </div>
  );
}