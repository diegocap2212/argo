import { NavLink } from "react-router-dom";
import { useSquadRole } from "@/hooks/useSquadRole";
import { cn } from "@/lib/utils";

interface SquadSubNavItem {
  label: string;
  path: string;
  visible: (ctx: ReturnType<typeof useSquadRole>) => boolean;
}

const ITEMS: SquadSubNavItem[] = [
  { label: "Jornada", path: "", visible: () => true },
  { label: "Sessão", path: "/sessao", visible: (r) => r.isMember || r.isAM },
  { label: "Homologação", path: "/homologacao", visible: (r) => r.isAM },
  { label: "Plano", path: "/plano", visible: (r) => r.isMember || r.isAM },
  { label: "Métricas", path: "/metricas", visible: (r) => r.isMember || r.isAM },
  { label: "Comparativo", path: "/comparativo", visible: (r) => r.isMember || r.isAM },
];

export function SquadSubNav({ teamId }: { teamId: string }) {
  const role = useSquadRole(teamId);

  return (
    <nav className="flex items-center gap-1 overflow-x-auto">
      {ITEMS.filter((item) => item.visible(role)).map((item) => (
        <NavLink
          key={item.path}
          to={`/s/${teamId}${item.path}`}
          end={item.path === ""}
          className={({ isActive }) =>
            cn(
              "whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
              isActive ? "bg-venice-accentSoft text-venice-accentSoftFg" : "text-venice-textSecondary hover:bg-secondary hover:text-foreground"
            )
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
