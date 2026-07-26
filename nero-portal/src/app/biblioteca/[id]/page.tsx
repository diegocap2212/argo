import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { loadDocument, tipoLabel } from "@/lib/biblioteca/queries";
import {
  STATUS_VERDADE_CLASS,
  STATUS_VERDADE_LABEL,
  isStatusVerdade,
} from "@/lib/state/provenance";

export const dynamic = "force-dynamic";

const fmtData = (d: Date) =>
  new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

export default async function DocumentoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const doc = await loadDocument(id);
  if (!doc) notFound();

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <Link
        href="/biblioteca"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Biblioteca
      </Link>

      <div className="mb-5 flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground">
          {tipoLabel(doc.tipo)}
        </span>
        {isStatusVerdade(doc.statusVerdade) && (
          <span
            className={`rounded-full px-2 py-0.5 font-medium ${STATUS_VERDADE_CLASS[doc.statusVerdade]}`}
          >
            {STATUS_VERDADE_LABEL[doc.statusVerdade]}
          </span>
        )}
        <span className="text-muted-foreground">Atualizado em {fmtData(doc.updatedAt)}</span>
      </div>

      <article className="prose prose-sm max-w-none dark:prose-invert prose-h1:font-serif prose-pre:bg-zinc-900 prose-pre:text-zinc-100">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{doc.conteudo}</ReactMarkdown>
      </article>
    </main>
  );
}
