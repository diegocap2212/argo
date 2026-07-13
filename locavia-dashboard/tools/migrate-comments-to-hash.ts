/**
 * Migração one-shot: blob único -> Redis Hash granular.
 *
 * - Lê o blob antigo `locavia_dashboard_comments`.
 * - Para cada folha [squadId][releaseId][quinzenaId][metricId], escreve um campo no hash v2.
 * - DESCARTA chaves de topo que são IDs de SM (gabriela/rafael/ed) — lixo do bug antigo
 *   em que squadId era o ID do SM em vez do carCode do time.
 * - Mantém o blob antigo intacto como backup.
 *
 * Uso: node_modules/.bin/tsx tools/migrate-comments-to-hash.ts [--dry]
 */
import { Redis } from '@upstash/redis';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../.env.local') });

const redis = new Redis({
  url: process.env.KV_REST_API_URL || '',
  token: process.env.KV_REST_API_TOKEN || '',
});

const OLD_KEY = 'locavia_dashboard_comments';
const HASH_KEY = 'locavia_dashboard_comments_v2';
const SEP = ':';

// IDs de SM que viraram chave por engano (bug antigo). Não são times reais.
const GARBAGE_TOP_KEYS = new Set(['gabriela', 'rafael', 'ed']);

const isDry = process.argv.includes('--dry');

function encodeField(squadId: string, releaseId: string, quinzenaId: string, metricId: string): string {
  return [squadId, releaseId, quinzenaId, metricId].map(encodeURIComponent).join(SEP);
}

async function main() {
  const blob = (await redis.get(OLD_KEY)) as Record<string, any> | null;
  if (!blob || typeof blob !== 'object') {
    console.log('Nenhum blob antigo encontrado. Nada a migrar.');
    return;
  }

  const fields: Record<string, any> = {};
  const skipped: string[] = [];
  let migrated = 0;

  for (const [squadId, releases] of Object.entries(blob)) {
    if (GARBAGE_TOP_KEYS.has(squadId)) {
      skipped.push(squadId);
      continue;
    }
    for (const [releaseId, quinzenas] of Object.entries(releases as Record<string, any>)) {
      for (const [quinzenaId, metrics] of Object.entries(quinzenas as Record<string, any>)) {
        for (const [metricId, comment] of Object.entries(metrics as Record<string, any>)) {
          const field = encodeField(squadId, releaseId, quinzenaId, metricId);
          fields[field] = comment;
          migrated++;
          console.log(`  + ${squadId} / ${releaseId} / ${quinzenaId} / ${metricId}`);
        }
      }
    }
  }

  console.log(`\nCampos a migrar: ${migrated}`);
  console.log(`Chaves-lixo descartadas (IDs de SM): ${skipped.join(', ') || '(nenhuma)'}`);

  if (isDry) {
    console.log('\n[DRY RUN] Nada foi escrito. Rode sem --dry para aplicar.');
    return;
  }

  if (migrated > 0) {
    await redis.hset(HASH_KEY, fields);
    console.log(`\n✅ ${migrated} campos escritos em '${HASH_KEY}'.`);
  } else {
    console.log('\nNenhum campo real para migrar (só havia lixo).');
  }
  console.log(`Blob antigo '${OLD_KEY}' mantido como backup.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
