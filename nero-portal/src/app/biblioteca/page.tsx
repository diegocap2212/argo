import Link from "next/link";
import { ArrowRight, BookText, Library } from "lucide-react";
import { loadDocuments, tipoLabel } from "@/lib/biblioteca/queries";
import {
  STATUS_VERDADE_CLASS,
  STATUS_VERDADE_LABEL,
  isStatusVerdade,
} from "@/lib/state/provenance";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Biblioteca — Portal Nero",
  description:
    "Base de conhecimento do Portal de Dados LM: atas, guias, políticas e mapeamentos produzidos pela Governança.",
};

const fmtData = (d: Date) =>
  new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

export default async function BibliotecaPage() {
  const docs = await loadDocuments();

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 overflow-y-auto px-4 py-6">
      <div className="mb-5">
        <h1 className="flex items-center gap-2 font-serif text-xl font-semibold tracking-tight">
          <Library className="h-5 w-5 text-brand" />
          Biblioteca
        </h1>
        <p className="text-sm text-muted-foreground">
          A base de conhecimento do Portal de Dados LM — atas, guias, políticas e mapeamentos
          produzidos pela Governança. Cada documento carrega seu status de verdade.
        </p>
      </div>

      {docs.length === 0 ? (
        <p className="text-sm text-muted-foreground">_(Nenhum documento na biblioteca.)_</p>
      ) : (
        <div className="grid gap-3">
          {docs.map((d) => (
            <Link key={d.id} href={`/biblioteca/${d.id}`}>
              <Card className="transition-colors hover:border-brand/50">
                <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <BookText className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="font-medium">{d.titulo}</span>
                    </div>
                    {d.resumo && (
                      <p className="mt-1 text-sm text-muted-foreground">{d.resumo}</p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground">
                        {tipoLabel(d.tipo)}
                      </span>
                      {isStatusVerdade(d.statusVerdade) && (
                        <span
                          className={`rounded-full px-2 py-0.5 font-medium ${STATUS_VERDADE_CLASS[d.statusVerdade]}`}
                        >
                          {STATUS_VERDADE_LABEL[d.statusVerdade]}
                        </span>
                      )}
                      <span className="text-muted-foreground">{fmtData(d.createdAt)}</span>
                    </div>
                  </div>
                  <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
