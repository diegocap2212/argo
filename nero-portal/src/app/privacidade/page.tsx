import type { Metadata } from "next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { loadKit } from "@/lib/nero/kit";

export const metadata: Metadata = {
  title: "Privacidade & LGPD — Portal Nero",
  description:
    "Guardrails de LGPD do projeto: o que pode e o que nunca deve ser enviado ao Nero.",
};

export default async function PrivacidadePage() {
  const kit = await loadKit();
  const guardrails = kit["06"];

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <div className="mb-6 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
        <p className="font-medium text-destructive">Regra de ouro</p>
        <p className="mt-1 text-muted-foreground">
          O Nero processa o que você escreve em um modelo externo.{" "}
          <strong>Nunca envie dados reais de pessoas</strong> (CPF, nomes, e-mails, telefones,
          endereços). Use só metadados, schemas e exemplos fictícios.
        </p>
      </div>

      <article className="prose prose-sm dark:prose-invert max-w-none prose-pre:bg-zinc-900 prose-pre:text-zinc-100">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{guardrails}</ReactMarkdown>
      </article>
    </main>
  );
}
