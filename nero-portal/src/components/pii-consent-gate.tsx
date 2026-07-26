"use client";

import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setLocalStorage, useLocalStorage } from "@/lib/use-local-storage";

/**
 * Gate de consentimento PII (primeiro uso, por navegador).
 *
 * Antes de qualquer interação com o portal, exige que a pessoa reconheça que NÃO
 * deve enviar dados reais de pessoas (PII) para o Nero. O consentimento é gravado
 * em localStorage; a versão na chave permite re-pedir no futuro se a regra mudar.
 *
 * Por que localStorage e não por-usuário: hoje o acesso é por senha compartilhada,
 * sem identidade individual — então o melhor disponível é por navegador.
 */
const CONSENT_KEY = "nero:pii-consent:v1";

export function PiiConsentGate() {
  // O servidor (e o 1º render de hidratação) trata como "consentido" para não
  // emitir o modal no HTML do SSR; no cliente o valor real entra em seguida via
  // useSyncExternalStore, sem mismatch de hidratação.
  const consented = useLocalStorage(CONSENT_KEY, "true") === "true";

  function accept() {
    setLocalStorage(CONSENT_KEY, "true");
  }

  if (consented) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pii-consent-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm print:hidden"
    >
      <div className="w-full max-w-lg rounded-2xl border bg-card p-6 text-card-foreground shadow-xl">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <ShieldAlert className="h-5 w-5" />
          </span>
          <div className="space-y-1">
            <h2 id="pii-consent-title" className="text-lg font-semibold tracking-tight">
              Antes de usar o Nero
            </h2>
            <p className="text-sm text-muted-foreground">
              O Nero é um advisor de dados. <strong>Nunca envie dados reais de pessoas</strong>{" "}
              (PII) nas conversas — eles seriam processados por um modelo externo.
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
            <p className="font-medium text-emerald-700 dark:text-emerald-400">✅ Pode enviar</p>
            <p className="mt-1 text-muted-foreground">
              Metadados, schemas, nomes de tabelas/campos, regras de negócio, exemplos fictícios.
            </p>
          </div>
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3">
            <p className="font-medium text-destructive">❌ Nunca envie</p>
            <p className="mt-1 text-muted-foreground">
              CPF, nomes, e-mails, telefones, endereços — qualquer dado real de pessoa.
            </p>
          </div>
        </div>

        <p className="mt-4 text-xs text-muted-foreground">
          Detalhes e exemplos nos{" "}
          <Link href="/privacidade" className="underline hover:text-foreground">
            guardrails de LGPD do projeto
          </Link>
          .
        </p>

        <div className="mt-5 flex justify-end">
          <Button onClick={accept} autoFocus>
            Li e entendi — não vou enviar dados reais de pessoas
          </Button>
        </div>
      </div>
    </div>
  );
}
