"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NeroLogo } from "@/components/nero-logo";
import { BASE_PATH } from "@/lib/base-path";

/**
 * Trava de acesso do Nero — a segunda das duas (ver src/proxy.ts).
 *
 * Quem chega aqui JÁ passou pela sessão do Portal NEO (login OTP + allowlist): o proxy só
 * serve esta tela para quem tem `neo_session`. O que falta é a senha específica do Nero,
 * porque ele contém informação proprietária.
 *
 * O POST vai para `/api/gate?scope=nero` — caminho ABSOLUTO, de propósito FORA do basePath:
 * essa function vive no projeto `neo-lm` (a mesma origem serve o hub, o Dash, o Maturity e
 * este app). É o mesmo endpoint que a Torre do Dash usa com ?scope=tower, e a senha nunca
 * entra no bundle: fica na env NERO_PASSWORD e é comparada server-side, com rate-limit.
 *
 * Substituiu o login por senha única própria do Nero (APP_PASSWORD + cookie nero_session de
 * 30 dias, sem identidade): agora a identidade vem do NEO e o TTL é de 12h.
 */
const GATE_URL = "/api/gate?scope=nero";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    if (!password || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const r = await fetch(GATE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (r.ok) {
        // Recarrega pela raiz do app (com basePath) — agora com o cookie neo_nero.
        window.location.assign(`${BASE_PATH}/`);
        return;
      }
      if (r.status === 403) setError("Senha incorreta.");
      else if (r.status === 429) setError("Muitas tentativas. Aguarde alguns minutos.");
      else if (r.status === 401) setError("Sua sessão do NEO expirou. Recarregue a página.");
      else setError("Não foi possível validar agora. Tente de novo.");
    } catch {
      setError("Não foi possível validar agora. Tente de novo.");
    } finally {
      setSubmitting(false);
      setPassword("");
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <NeroLogo size={64} className="drop-shadow-md" />
          <div>
            <h1 className="font-serif text-lg font-semibold tracking-tight">Portal Nero</h1>
            <p className="text-sm text-muted-foreground">Governança de Dados · LM</p>
          </div>
        </div>

        <form onSubmit={unlock} className="space-y-3 rounded-2xl border bg-card p-5 shadow-sm">
          <label htmlFor="password" className="block text-sm font-medium">
            Senha de acesso
          </label>
          <Input
            id="password"
            name="password"
            type="password"
            autoFocus
            required
            placeholder="••••••••"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Validando…" : "Entrar"}
          </Button>
        </form>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Acesso restrito à equipe de Governança.
        </p>
      </div>
    </main>
  );
}
