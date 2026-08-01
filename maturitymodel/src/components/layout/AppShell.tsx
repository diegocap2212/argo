import { type ReactNode } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { BookOpen, Building2, Home, LayoutGrid, LogOut, Presentation, Settings, Users } from "lucide-react";
import { VeniceLogo } from "@/components/mma/VeniceLogo";
import { SquadSwitcher } from "@/components/mma/SquadSwitcher";
import { AxisPills } from "@/components/mma/AxisPills";
import { SquadSubNav } from "@/components/layout/SquadSubNav";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { useMySquads } from "@/hooks/useMySquads";
import { usePortalRole } from "@/hooks/usePortalRole";
import { cn } from "@/lib/utils";

const GLOBAL_TITLES: Record<string, { eyebrow: string; title: string }> = {
  "/": { eyebrow: "Visão pessoal", title: "Início" },
  "/torre": { eyebrow: "Visão executiva", title: "Torre de squads" },
  "/guia": { eyebrow: "Referência", title: "Guia do modelo" },
  "/admin": { eyebrow: "Configurações", title: "Administração" },
};

function RailLink({ to, label, icon, badge }: { to: string; label: string; icon: ReactNode; badge?: number }) {
  const location = useLocation();
  const active = location.pathname === to;
  return (
    <Tooltip delayDuration={120}>
      <TooltipTrigger asChild>
        <Link
          to={to}
          aria-label={label}
          className={cn("editorial-rail-link", active && "is-active")}
        >
          {icon}
          {!!badge && <span className="editorial-rail-badge">{badge}</span>}
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { teamId } = useParams<{ teamId: string }>();
  const { user, signOut, redirectToHub } = useAuth();
  const { data: squads = [] } = useMySquads();
  const { isAdmin } = usePortalRole();
  const pendingCount = squads.filter((s) => s.pending).length;
  // "Meu squad" tem de ser um squad DELE: para o AM/admin a lista traz todos, e o
  // primeiro seria um squad qualquer da ordem alfabética.
  const mySquad = squads.find((s) => s.isMine) ?? squads[0];
  const inSquadContext = Boolean(teamId);
  const globalTitle = GLOBAL_TITLES[location.pathname];
  const initials = (user?.email ?? "MA").slice(0, 2).toUpperCase();

  return (
    <div className="editorial-shell">
      <aside className="editorial-rail" aria-label="Navegação principal">
        <nav className="editorial-rail-nav">
          <Tooltip delayDuration={120}>
            <TooltipTrigger asChild>
              <button className="editorial-rail-link" onClick={redirectToHub} aria-label="Voltar ao NEO">
                <LayoutGrid />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Trocar aplicação · NEO</TooltipContent>
          </Tooltip>
          <RailLink to="/" label="Início" icon={<Home />} badge={pendingCount} />
          <RailLink to="/torre" label="Torre de squads" icon={<Building2 />} />
          {mySquad && <RailLink to={`/s/${mySquad.team_id}`} label="Meu squad" icon={<Users />} />}
          <RailLink to="/guia" label="Guia do modelo" icon={<BookOpen />} />
          {/* Sai deste app: a administração virou o `/admin` do NEO (31/07/2026). Âncora
              comum, não RailLink — `to="/admin"` cairia no redirecionador interno e daria dois
              saltos para chegar ao mesmo lugar. */}
          {isAdmin && (
            <Tooltip delayDuration={120}>
              <TooltipTrigger asChild>
                <a className="editorial-rail-link" href="/admin/" aria-label="Administração do NEO">
                  <Settings />
                </a>
              </TooltipTrigger>
              <TooltipContent side="right">Administração · NEO</TooltipContent>
            </Tooltip>
          )}
        </nav>
        <div className="editorial-rail-footer">
          <Tooltip delayDuration={120}>
            <TooltipTrigger asChild>
              <button className="editorial-avatar" onClick={() => void signOut()} aria-label="Sair da conta">{initials}</button>
            </TooltipTrigger>
            <TooltipContent side="right"><span className="flex items-center gap-2"><LogOut className="h-3.5 w-3.5" /> Sair</span></TooltipContent>
          </Tooltip>
        </div>
      </aside>

      <div className="editorial-workspace">
        <header className="editorial-topbar">
          <Link to="/" className="editorial-brand">
            <VeniceLogo height={18} />
          </Link>
          <img
            src={`${import.meta.env.BASE_URL}maturity-model-logo.png`}
            alt="Maturity Model"
            className="editorial-product-logo"
          />
          <div className="editorial-top-actions">
            {inSquadContext ? <SquadSwitcher /> : <img src={`${import.meta.env.BASE_URL}lm-mobilidade.png`} alt="LM Mobilidade" className="editorial-lm-logo" />}
            {inSquadContext && <AxisPills teamId={teamId!} />}
            {inSquadContext && (
              <Button asChild variant="outline" size="sm" className="rounded-full">
                <Link to={`/s/${teamId}/apresentar`}><Presentation /> Apresentar</Link>
              </Button>
            )}
          </div>
        </header>

        {inSquadContext && <div className="editorial-subnav"><SquadSubNav teamId={teamId!} /></div>}
        {!inSquadContext && location.pathname !== "/" && (
          <div className="editorial-page-heading">
            <span>{globalTitle?.eyebrow}</span>
            <h1>{globalTitle?.title}</h1>
          </div>
        )}
        <main className={cn("editorial-main", location.pathname === "/" && "editorial-main-home")}>{children}</main>
      </div>
    </div>
  );
}
