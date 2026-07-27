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
      {/*
        Esta copy foi CORRIGIDA em 2026-07-27 (achado 7.9 do code review).
        Ela dizia "nunca envie nomes" como se fosse uma garantia do produto, enquanto o
        servidor mandava `Stakeholder.nome`, `Decision.quem` e `Risk.dono` para o modelo em
        todo turno. Era educação vestida de controle: não havia detecção, mascaramento nem
        bloqueio. Agora descreve o que de fato acontece — e o que continua sendo do usuário.
      */}
      <div className="mb-6 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
        <p className="font-medium text-destructive">O que sai deste portal</p>
        <p className="mt-1 text-muted-foreground">
          O Nero processa em um modelo externo (Claude, da Anthropic) tudo que você escreve no
          chat, <strong>mais</strong> o estado do projeto que ele carrega como contexto a cada
          turno.
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
          <li>
            <strong>O que o servidor remove antes de enviar:</strong> e-mail, CPF, CNPJ e
            telefone em qualquer texto do contexto.
          </li>
          <li>
            <strong>O que o servidor pseudonimiza:</strong> os campos de pessoa do estado
            (stakeholder, quem decidiu, dono do risco) viram <code>Pessoa-1234</code> — estável,
            para o Nero ainda entender que é a mesma pessoa, sem o nome sair.
          </li>
          <li>
            <strong>O que NÃO é filtrado:</strong> o texto que você digita. Ele vai como está —
            é a sua pergunta. Um nome escrito no meio de uma frase também não é detectado no
            estado; só os campos que o sistema sabe que são de pessoa.
          </li>
        </ul>
        <p className="mt-2 text-muted-foreground">
          Portanto: continue usando <strong>metadados, schemas e exemplos fictícios</strong>. A
          diferença é que agora isso é uma boa prática sua, não a única barreira existente.
        </p>
      </div>

      <article className="prose prose-sm dark:prose-invert max-w-none prose-pre:bg-zinc-900 prose-pre:text-zinc-100">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{guardrails}</ReactMarkdown>
      </article>
    </main>
  );
}
