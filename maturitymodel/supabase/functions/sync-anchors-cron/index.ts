// ============================================================================
// supabase/functions/sync-anchors-cron/index.ts
// Sincronização DIÁRIA de todos os squads mapeados, disparada pelo pg_cron.
//
// Substitui a outra metade da antiga `sync-anchors`. A diferença que importa: o gatilho
// deixa de ser o JWT `anon`.
//
// A anon key é PÚBLICA — vai no bundle do browser e estava hardcoded na migration do cron
// (20260712190000). Como ela passa no `verify_jwt` e o handler não checava papel nenhum,
// qualquer pessoa com a chave (ou seja: qualquer visitante do portal) podia disparar carga
// na API do Jira e escrita privilegiada em `anchor_readings` via `service_role`.
//
// Agora o gatilho é uma secret EXCLUSIVA em header (`x-anchor-sync-secret`), guardada no
// Vault do Postgres e lida pelo job de cron. Por isso esta função roda com
// `verify_jwt = false` (ver supabase/config.toml): chamada service-to-service não tem
// usuário, e o controle de acesso é a secret — não um JWT de projeto.
//
// Secret: `supabase secrets set ANCHOR_SYNC_CRON_SECRET=...` (mesmo valor no Vault).
// ============================================================================

import { requireCronSecret } from "../_shared/authz.ts";
import { syncAllMappedTeams } from "../_shared/anchor-sync.ts";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "Use POST." }, 405);

  const auth = await requireCronSecret(req);
  if (!auth.ok) {
    // Não diz SE a secret existe ou está só errada.
    console.warn("[sync-anchors-cron] chamada recusada (secret ausente/inválida).");
    return json({ ok: false, error: auth.error }, auth.status);
  }

  try {
    const { results, unmapped } = await syncAllMappedTeams();
    if (unmapped.length) {
      // Antes, squad ativo fora do mapa hardcoded era pulado em silêncio: o painel dele
      // ficava sem leitura e ninguém descobria. Agora é ruído deliberado no log.
      console.warn(`[sync-anchors-cron] squads ativos SEM mapa Jira (pulados): ${unmapped.join(", ")}`);
    }
    console.log(`[sync-anchors-cron] ${results.length} squads sincronizados.`);
    return json({ ok: true, synced: results.length, unmapped, results });
  } catch (e) {
    console.error("[sync-anchors-cron] falha:", e);
    return json({ ok: false, error: "Falha na sincronização agendada." }, 502);
  }
});
