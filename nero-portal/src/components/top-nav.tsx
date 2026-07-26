"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  MessageSquare,
  LayoutDashboard,
  Database,
  FileText,
  GraduationCap,
  Library,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BudgetMeter } from "@/components/budget-meter";
import { NeroLogo } from "@/components/nero-logo";

// "Projeto" reúne Estado vivo (/estado) + Fases (/roadmap) — ativo em ambos.
const LINKS = [
  { href: "/", label: "Chat", icon: MessageSquare, match: (p: string) => p === "/" },
  {
    href: "/estado",
    label: "Projeto",
    icon: LayoutDashboard,
    match: (p: string) => p.startsWith("/estado") || p.startsWith("/roadmap"),
  },
  { href: "/catalogo", label: "Catálogo", icon: Database, match: (p: string) => p.startsWith("/catalogo") },
  { href: "/biblioteca", label: "Biblioteca", icon: Library, match: (p: string) => p.startsWith("/biblioteca") },
  { href: "/report", label: "Report", icon: FileText, match: (p: string) => p.startsWith("/report") },
  { href: "/academia", label: "Academia", icon: GraduationCap, match: (p: string) => p.startsWith("/academia") },
];

export function TopNav() {
  const pathname = usePathname();
  if (pathname === "/login") return null;
  return (
    <header className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur print:hidden">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-4 px-4">
        {/* Marca */}
        <Link href="/" className="flex items-center gap-2.5">
          <NeroLogo size={32} />
          <span className="flex flex-col leading-none">
            <span className="font-serif text-base font-semibold tracking-tight">Nero</span>
            <span className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
              Governança de Dados · LM
            </span>
          </span>
        </Link>

        {/* Navegação */}
        <nav className="ml-2 flex flex-1 items-center gap-0.5">
          {LINKS.map((l) => {
            const active = l.match(pathname);
            const Icon = l.icon;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-brand/12 text-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                )}
              >
                <Icon className={cn("h-4 w-4", active ? "text-brand" : "text-muted-foreground")} />
                <span className="hidden md:inline">{l.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Indicador de budget (discreto, à direita) */}
        <BudgetMeter />
      </div>
    </header>
  );
}
