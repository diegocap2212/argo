import Link from "next/link";
import { ArrowRight, GraduationCap, Users } from "lucide-react";
import { loadTrilha, TRILHAS } from "@/lib/academia/trilhas";
import { TrilhaProgressChip } from "@/components/trilha-progress";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = {
  title: "Academia — Portal Nero",
  description:
    "Trilhas guiadas em que o Nero ensina governança de dados na prática, com exemplos reais do LM.",
};

export default async function AcademiaPage() {
  const trilhas = (
    await Promise.all(TRILHAS.map((t) => loadTrilha(t.slug)))
  ).filter((t): t is NonNullable<typeof t> => t !== null);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 overflow-y-auto px-4 py-6">
      <div className="mb-5">
        <h1 className="flex items-center gap-2 font-serif text-xl font-semibold tracking-tight">
          <GraduationCap className="h-5 w-5 text-brand" />
          Academia
        </h1>
        <p className="text-sm text-muted-foreground">
          Um portal de documentos não te ensina; o Nero sim. Cada trilha é uma aula guiada:
          você lê um passo curto e conversa com o tutor ao lado — que usa os dados reais do LM
          como exemplo sempre que existirem.
        </p>
      </div>

      <div className="grid gap-3">
        {trilhas.map((t) => (
          <Link key={t.slug} href={`/academia/${t.slug}`}>
            <Card className="transition-colors hover:border-brand/50">
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{t.titulo}</div>
                  <p className="mt-0.5 text-sm text-muted-foreground">{t.descricao}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" />
                      {t.publico}
                    </span>
                    <span>{t.duracao}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <TrilhaProgressChip trilhaSlug={t.slug} totalSteps={t.steps.length} />
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </main>
  );
}
