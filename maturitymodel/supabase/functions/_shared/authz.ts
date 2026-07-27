// ============================================================================
// supabase/functions/_shared/authz.ts
// Autorização das Edge Functions do Maturity.
//
// REGRA: `verify_jwt` da plataforma prova que o token é ASSINADO. Ele não diz nada sobre
// PAPEL nem sobre QUAL squad a pessoa pode tocar — e a anon key também é um JWT assinado
// válido. Autorização de negócio é responsabilidade do handler, e é o que estava faltando.
//
// O papel NÃO é reimplementado aqui em TypeScript: a fonte de verdade é o Postgres, via
// RPC `can_sync_anchors`, que reusa `is_sm(team)` / `is_portal_am()` — os mesmos helpers
// que as policies de RLS usam. Duas cópias da matriz de papéis divergiriam.
// ============================================================================

const SB_URL = Deno.env.get("SB_URL") ?? "";
const SB_ANON = Deno.env.get("SB_ANON_KEY") ?? "";

export type AuthzResult =
  | { ok: true; userId: string; email: string | null }
  | { ok: false; status: 401 | 403; error: string };

/** Payload do JWT, sem verificar assinatura (a plataforma já verificou). */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

/**
 * Exige um usuário REAL autorizado a sincronizar as âncoras de `teamId`.
 *
 * Barra explicitamente `role: anon`: a anon key é pública e passa no `verify_jwt`, então
 * sem esta checagem qualquer visitante do portal poderia disparar a função.
 */
export async function requireAnchorSyncPermission(
  req: Request,
  teamId: string,
): Promise<AuthzResult> {
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { ok: false, status: 401, error: "Autenticação obrigatória." };

  const claims = decodeJwtPayload(token);
  if (!claims) return { ok: false, status: 401, error: "Token ilegível." };

  // A anon key tem role=anon e NÃO tem sub. Nenhuma das duas coisas pode passar.
  const role = typeof claims.role === "string" ? claims.role : null;
  const userId = typeof claims.sub === "string" ? claims.sub : null;
  if (role !== "authenticated" || !userId) {
    return { ok: false, status: 401, error: "Esta função exige sessão de usuário, não chave de projeto." };
  }

  if (!SB_URL || !SB_ANON) {
    // Fail-CLOSED: sem como consultar o papel, não autoriza. É escrita privilegiada.
    return { ok: false, status: 403, error: "Serviço de autorização indisponível." };
  }

  // O RPC roda COM O TOKEN DO USUÁRIO, então `auth.uid()` dentro dele é a pessoa.
  const res = await fetch(`${SB_URL}/rest/v1/rpc/can_sync_anchors`, {
    method: "POST",
    headers: {
      apikey: SB_ANON,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_team: teamId }),
  });
  if (!res.ok) return { ok: false, status: 403, error: "Não autorizado para este squad." };
  const allowed = await res.json().catch(() => false);
  if (allowed !== true) {
    return { ok: false, status: 403, error: "Só o SM deste squad, ou um AM/admin, pode sincronizar." };
  }

  const email = typeof claims.email === "string" ? claims.email : null;
  return { ok: true, userId, email };
}

/**
 * Autentica o CRON por secret exclusiva em header, com comparação em tempo constante.
 *
 * Nunca a anon key: o cron antigo mandava `Authorization: Bearer <anon jwt>` hardcoded na
 * migration, o que colocava uma credencial pública no papel de gatilho privilegiado.
 */
export async function requireCronSecret(
  req: Request,
): Promise<{ ok: true } | { ok: false; status: 401; error: string }> {
  const expected = Deno.env.get("ANCHOR_SYNC_CRON_SECRET") ?? "";
  // Fail-closed: sem secret configurada a função não roda. O oposto (deixar passar quando a
  // env falta) é justamente como a anon key virou gatilho.
  if (!expected) return { ok: false, status: 401, error: "Cron não configurado." };
  const provided = req.headers.get("x-anchor-sync-secret") ?? "";
  if (!(await timingSafeEqual(provided, expected))) {
    return { ok: false, status: 401, error: "Secret de cron inválida." };
  }
  return { ok: true };
}

/**
 * Compara em tempo constante. Faz SHA-256 dos dois lados primeiro para que os buffers
 * tenham SEMPRE 32 bytes — assim nem o comprimento do segredo vaza pelo tempo de resposta.
 * Mesma técnica de `api/gate.ts` no portal.
 */
async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const va = new Uint8Array(ha);
  const vb = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
  return diff === 0;
}
