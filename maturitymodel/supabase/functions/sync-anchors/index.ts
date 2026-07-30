// ============================================================================
// supabase/functions/sync-anchors/index.ts
//
// ⚠️ SHIM TEMPORÁRIO — REMOVER JUNTO COM O DEPLOY DO PORTAL.
//
// POR QUE ELE EXISTE: o P0.1 do review (Edge Function com `service_role` e SEM autorização)
// foi corrigido criando `sync-anchors-user` e `sync-anchors-cron`. Mas o front EM PRODUÇÃO
// ainda invoca o nome antigo `sync-anchors` — `supabase.functions.invoke("sync-anchors")` —
// porque o deploy do portal está travado num gate humano (a troca para subchaves HKDF derruba
// toda sessão viva e exige avisar o time).
//
// Isso deixava a correção presa atrás de um deploy disruptivo: enquanto ninguém avisasse o
// time, a função vulnerável seguia no ar. Apagá-la antes quebraria o botão "Sincronizar agora".
//
// A saída é separar as duas coisas. O P0 não é "esta função existe" — é "esta função não
// autoriza". Republicando o NOME antigo com a implementação AUTORIZADA, o buraco fecha hoje e
// o front de produção continua funcionando sem nenhuma mudança.
//
// Importar o módulo já registra o `Deno.serve` dele: o comportamento é idêntico ao
// `sync-anchors-user`, incluindo `team_id` obrigatório, o RPC `can_sync_anchors`, o bloqueio
// explícito da anon key e o cooldown.
//
// COMO REMOVER (depois que o portal novo estiver em produção chamando `sync-anchors-user`):
//   1. confirmar no bundle: `grep -c sync-anchors-user` no chunk Anchors de produção
//   2. `supabase functions delete sync-anchors --project-ref <ref>`
//   3. apagar esta pasta
// Enquanto os dois nomes coexistirem, os dois são seguros — o que era o objetivo.
// ============================================================================

import "../sync-anchors-user/index.ts";
