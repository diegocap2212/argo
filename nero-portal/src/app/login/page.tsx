import { NeroLogo } from "@/components/nero-logo";

/**
 * "Seu acesso ao Nero não está liberado."
 *
 * ESTA TELA DEIXOU DE PEDIR SENHA em 31/07/2026. Até então ela era a segunda trava: quem
 * tinha sessão do NEO digitava a `NERO_PASSWORD` compartilhada e recebia o cookie `neo_nero`.
 * Agora quem decide é a permissão `neo.nero.access`, perguntada pelo proxy ao `/api/authz` do
 * portal a cada navegação — não há nada para a pessoa digitar aqui.
 *
 * Por que a tela continua existindo em vez de um 403: quem chega aqui TEM sessão do NEO e
 * errou de porta, não de credencial. Um 403 seco mandaria essa pessoa procurar um problema
 * técnico; o que ela precisa saber é a quem pedir.
 *
 * Server Component de propósito: não há estado, não há formulário, não há `fetch`. Era
 * `"use client"` só por causa do campo de senha.
 */
export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <NeroLogo size={64} className="drop-shadow-md" />
          <div>
            <h1 className="font-serif text-lg font-semibold tracking-tight">Portal Nero</h1>
            <p className="text-sm text-muted-foreground">Governança de Dados · LM</p>
          </div>
        </div>

        <div className="space-y-3 rounded-2xl border bg-card p-6 shadow-sm">
          <h2 className="font-serif text-base font-semibold">Seu acesso ao Nero não está liberado</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Você está autenticado no NEO, mas ainda não tem a permissão{" "}
            <strong className="font-medium text-foreground">Entrar no Nero</strong>. Peça a um
            administrador do NEO — ele concede na área de Administração, sem precisar de senha
            nova para ninguém.
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Se o acesso acabou de ser concedido, recarregue esta página: a liberação vale em até
            um minuto, sem novo login.
          </p>
          {/* Âncora crua e URL ABSOLUTA de propósito: o destino é o hub do NEO, que é OUTRO
              app servido pela mesma origem — não é rota deste Next. `next/link` faria
              navegação client-side para uma rota que não existe aqui, e um href relativo `/`
              seria reescrito pelo basePath `/nero`. O `NEO_ORIGIN` é lido em tempo de build
              porque esta é uma página estática sem estado. */}
          <a
            href={process.env.NEXT_PUBLIC_NEO_ORIGIN || "https://neo-lm.vercel.app"}
            className="mt-2 inline-flex text-sm font-medium text-foreground underline underline-offset-4"
          >
            ← Voltar ao NEO
          </a>
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Acesso restrito à equipe de Governança.
        </p>
      </div>
    </main>
  );
}
