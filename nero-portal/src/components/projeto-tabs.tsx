"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Abas do "Projeto" — unifica Visão geral (estado vivo) e Fases (roadmap) sob um
 * mesmo guarda-chuva, resolvendo a sobreposição das duas visões de status.
 * As URLs seguem /estado e /roadmap; só a navegação é reorganizada.
 */

const TABS = [
  { href: "/estado", label: "Visão geral", match: (p: string) => p.startsWith("/estado") },
  { href: "/roadmap", label: "Fases", match: (p: string) => p.startsWith("/roadmap") },
];

export function ProjetoTabs() {
  const pathname = usePathname();
  return (
    <div className="mb-6">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
        Projeto
      </p>
      <div className="mt-1.5 flex items-center gap-1 border-b">
        {TABS.map((t) => {
          const active = t.match(pathname);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "border-brand text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
