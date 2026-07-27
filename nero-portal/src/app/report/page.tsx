import Link from "next/link";
import { ArrowRight, FileText, Sparkles } from "lucide-react";
import { prisma } from "@/lib/db";
import { buildReportData } from "@/lib/report/build";
import { generateReportAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";
// A server action de geração (1 chamada de IA) roda neste segmento.
export const maxDuration = 60;

const RAG_BADGE: Record<string, string> = {
  verde: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  amarelo: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  vermelho: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};

const fmt = (d: Date) =>
  new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

export default async function ReportListPage() {
  const reports = await prisma.report.findMany({ orderBy: { numero: "desc" } });

  // Preview vivo: o que entraria num report gerado agora.
  const fim = new Date();
  const inicio =
    reports[0]?.periodoFim ?? new Date(fim.getTime() - 14 * 24 * 60 * 60 * 1000);
  const preview = await buildReportData(inicio, fim);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 overflow-y-auto px-4 py-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-xl font-semibold tracking-tight">Report Quinzenal</h1>
          <p className="text-sm text-muted-foreground">
            Gerado do estado vivo do portal — não de slides. Cada report congela um
            snapshot auditável da quinzena (kit 04) com narrativa do Nero.
          </p>
        </div>
        <form action={generateReportAction}>
          <Button type="submit">
            <Sparkles className="h-4 w-4" />
            Gerar report da quinzena
          </Button>
        </form>
      </div>

      {/* Preview do período corrente */}
      <Card className="mb-5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4 text-brand" />
            Quinzena corrente (desde {fmt(inicio)})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <div className="text-2xl font-semibold">{preview.entregas.length}</div>
              <div className="text-xs text-muted-foreground">entregas concluídas</div>
            </div>
            <div>
              <div className="text-2xl font-semibold">{preview.emAndamento.length}</div>
              <div className="text-xs text-muted-foreground">frentes em andamento</div>
            </div>
            <div>
              <div className="text-2xl font-semibold">
                {preview.blockers.filter((b) => b.agingNivel === "vermelho").length}
                <span className="text-sm font-normal text-muted-foreground">
                  {" "}
                  / {preview.blockers.length}
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                dependências LM críticas / abertas
              </div>
            </div>
            <div>
              <div className="text-2xl font-semibold">
                {preview.catalogoResumo.total}
                <span className="text-sm font-normal text-muted-foreground">
                  {" "}
                  ({preview.catalogoResumo.prontas} prontas)
                </span>
              </div>
              <div className="text-xs text-muted-foreground">tabelas no catálogo</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Histórico */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Histórico de reports</CardTitle>
        </CardHeader>
        <CardContent>
          {reports.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum report gerado ainda. O primeiro report cobre os últimos 14 dias.
            </p>
          ) : (
            <ul className="divide-y">
              {reports.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/report/${r.id}`}
                    className="flex items-center justify-between gap-3 py-3 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold">Q{r.numero}</span>
                      <span className="text-sm text-muted-foreground">
                        {fmt(r.periodoInicio)} → {fmt(r.periodoFim)}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${RAG_BADGE[r.statusGeral] ?? RAG_BADGE.amarelo}`}
                      >
                        {r.statusGeral}
                      </span>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
