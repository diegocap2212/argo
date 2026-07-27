// ============================================================================
// supabase/functions/sync-anchors-user/index.ts
// Sincronização de âncoras SOB DEMANDA, disparada por uma pessoa no portal
// (botão "Sincronizar agora" — ver src/hooks/useAnchors.ts).
//
// Substitui metade da antiga `sync-anchors`, que não tinha autorização nenhuma: aceitava
// body vazio e sincronizava TODOS os squads, aceitava qualquer `team_id`, e gravava com
// `service_role`. Aqui:
//   · `team_id` é OBRIGATÓRIO — não existe "sincroniza tudo" no caminho de usuário;
//   · a pessoa tem de ser SM daquele squad, ou AM/admin global (RPC can_sync_anchors);
//   · a anon key é barrada explicitamente (é pública e passa no verify_jwt);
//   · há rate limit por (usuário, squad) para o botão não virar gerador de carga no Jira.
//
// `verify_jwt` fica LIGADO (default) — esta função é chamada com sessão de usuário.
// ============================================================================

import { requireAnchorSyncPermission } from "../_shared/authz.ts";
import { syncTeam } from "../_shared/anchor-sync.ts";

/** Janela mínima entre sincronizações do MESMO squad, por qualquer pessoa. */
const COOLDOWN_MS = 5 * 60 * 1000;

/**
 * Memória de última sincronização por squad, por instância da função. É um amortecedor
 * contra clique repetido, não uma garantia distribuída: instâncias diferentes têm mapas
 * diferentes. A defesa real contra abuso é a autorização acima; isto é higiene de custo.
 * Idempotência forte (por `team_id` + janela, no banco) está no backlog de 2.2.
 */
const lastSync = new Map<string, number>();

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "Use POST." }, 405);

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return json({ ok: false, error: "Body JSON obrigatório." }, 400);

  const teamId = (body as { team_id?: unknown }).team_id;
  const cycleId = (body as { cycle_id?: unknown }).cycle_id;
  if (typeof teamId !== "string" || !teamId) {
    // Sem `team_id` NÃO cai em "sincroniza todos" — era exatamente esse default que
    // transformava uma chamada anônima em carga sobre os 8 squads mapeados.
    return json({ ok: false, error: "team_id é obrigatório." }, 400);
  }
  if (cycleId !== undefined && cycleId !== null && typeof cycleId !== "string") {
    return json({ ok: false, error: "cycle_id inválido." }, 400);
  }

  const authz = await requireAnchorSyncPermission(req, teamId);
  if (!authz.ok) return json({ ok: false, error: authz.error }, authz.status);

  const previous = lastSync.get(teamId);
  if (previous && Date.now() - previous < COOLDOWN_MS) {
    const waitSec = Math.ceil((COOLDOWN_MS - (Date.now() - previous)) / 1000);
    return json({ ok: false, error: `Sincronizado há pouco. Tente em ${waitSec}s.` }, 429);
  }

  try {
    lastSync.set(teamId, Date.now());
    const result = await syncTeam(teamId, typeof cycleId === "string" ? cycleId : null);
    // Auditoria do CHAMADOR: antes não havia registro de quem disparou a carga no Jira.
    console.log(`[sync-anchors-user] team=${teamId} por=${authz.email ?? authz.userId}`);
    return json({ ok: true, result });
  } catch (e) {
    // Libera o cooldown: falha não deve bloquear a próxima tentativa legítima.
    lastSync.delete(teamId);
    // Detalhe vai para o log, não para o cliente — o erro do Jira/Postgres pode conter
    // nome de tabela, constraint ou trecho de query.
    console.error(`[sync-anchors-user] falha team=${teamId}:`, e);
    return json({ ok: false, error: "Falha ao sincronizar as âncoras deste squad." }, 502);
  }
});
