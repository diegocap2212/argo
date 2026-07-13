/**
 * Inspeciona o conteúdo do Redis de produção (blob antigo + hash v2).
 * Uso: node_modules/.bin/tsx tools/inspect-redis.ts
 * Limpa o hash v2: node_modules/.bin/tsx tools/inspect-redis.ts --clear-v2
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

async function main() {
  if (process.argv.includes('--clear-v2')) {
    await redis.del(HASH_KEY);
    console.log(`Hash '${HASH_KEY}' apagado (slate limpo).`);
    return;
  }

  const blob = await redis.get(OLD_KEY);
  console.log('=== BLOB ANTIGO (' + OLD_KEY + ') ===');
  console.log(JSON.stringify(blob, null, 2));

  const hash = await redis.hgetall(HASH_KEY);
  console.log('\n=== HASH V2 (' + HASH_KEY + ') ===');
  console.log(JSON.stringify(hash, null, 2));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
