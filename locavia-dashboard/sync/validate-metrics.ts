import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import data from '../src/data.json';
import type { DashboardItem } from '../src/types/jira';
import { extractStoryPoints } from './story-points';
import { classifyStatus } from './status-classification';

/**
 * Valida a FIDELIDADE do dataset (src/data.json) contra os valores crus do Jira:
 * "os dados que vêm de lá pra cá estão corretos?".
 *
 * Para um sample de issues, compara campo a campo o item normalizado vs. o Jira ao vivo:
 *   Resolved↔resolutiondate · Status↔status.name · StatusCategory↔classifyStatus(live) ·
 *   StoryPoints↔SP fields · Created · Type · Modulo(cf11297) · Jornada(cf12386).
 *
 * Uso:  npx tsx sync/validate-metrics.ts [TIME] [N]
 *   TIME: filtra o sample a um time (default: todos)
 *   N: tamanho do sample (default: 80)
 *
 * Requer token com acesso de leitura aos projetos LM (.env.local).
 * NÃO altera nada — só lê Jira e imprime divergências.
 */

const baseUrl = process.env.JIRA_BASE_URL?.replace(/\/$/, '');
const email = process.env.JIRA_USER_EMAIL;
const token = process.env.JIRA_API_TOKEN;
const headers = {
  Authorization: `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`,
  Accept: 'application/json',
  'Content-Type': 'application/json',
};

function sample<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; }
  return copy.slice(0, n);
}

async function fetchByKeys(keys: string[]): Promise<Map<string, any>> {
  const out = new Map<string, any>();
  for (let i = 0; i < keys.length; i += 50) {
    const batch = keys.slice(i, i + 50);
    const jql = `key in (${batch.join(',')})`;
    const res = await fetch(`${baseUrl}/rest/api/3/search/jql`, {
      method: 'POST', headers,
      body: JSON.stringify({ jql, maxResults: 50, fields: ['summary', 'status', 'issuetype', 'created', 'resolutiondate', 'customfield_11795', 'customfield_12386', 'customfield_11297', 'customfield_13338', 'customfield_10026', 'customfield_10016', 'customfield_10028'] }),
    });
    if (!res.ok) { console.error(`Busca falhou: ${res.status} — ${(await res.text()).slice(0, 200)}`); process.exit(1); }
    for (const issue of (await res.json()).issues || []) out.set(issue.key, issue);
  }
  return out;
}

async function main() {
  if (!baseUrl || !email || !token) { console.error('❌ Faltam credenciais do Jira (.env.local).'); process.exit(1); }

  const team = process.argv[2];
  const n = Number(process.argv[3] || 80);
  let items = data as unknown as DashboardItem[];
  if (team) items = items.filter(i => i.Team.trim() === team);

  const chosen = sample(items, n);
  console.log(`Validando ${chosen.length} itens${team ? ` do time ${team}` : ''} contra o Jira ao vivo...\n`);

  const live = await fetchByKeys(chosen.map(i => i.Key));

  const mismatches: Record<string, { count: number; examples: string[] }> = {};
  const record = (field: string, key: string, stored: unknown, jira: unknown) => {
    (mismatches[field] ||= { count: 0, examples: [] }).count++;
    if (mismatches[field].examples.length < 5) mismatches[field].examples.push(`${key}: dash=${JSON.stringify(stored)} jira=${JSON.stringify(jira)}`);
  };

  let notFound = 0;
  for (const it of chosen) {
    const j = live.get(it.Key);
    if (!j) { notFound++; continue; }
    const f = j.fields;

    // Resolved ↔ resolutiondate
    if ((it.Resolved || null) !== (f.resolutiondate || null)) record('Resolved↔resolutiondate', it.Key, it.Resolved, f.resolutiondate);
    // Status ↔ status.name (uppercase, como o sync grava)
    if ((it.Status || '') !== (f.status?.name || '').toUpperCase()) record('Status↔status.name', it.Key, it.Status, f.status?.name);
    // StatusCategory ↔ classificação ao vivo
    const liveCat = classifyStatus((f.status?.name || '').toUpperCase(), f.status?.statusCategory?.name || '', !!f.resolutiondate);
    if (it.StatusCategory !== liveCat) record('StatusCategory', it.Key, it.StatusCategory, liveCat);
    // StoryPoints ↔ SP fields
    const liveSP = extractStoryPoints(f);
    if ((it.StoryPoints ?? null) !== (liveSP ?? null)) record('StoryPoints', it.Key, it.StoryPoints, liveSP);
    // Created
    if ((it.Created || null) !== (f.created || null)) record('Created', it.Key, it.Created, f.created);
    // Type
    if ((it.Type || '') !== (f.issuetype?.name || 'Task')) record('Type', it.Key, it.Type, f.issuetype?.name);
    // Modulo ↔ cf11297
    const liveMod = typeof f.customfield_11297 === 'string' ? f.customfield_11297.trim() : (f.customfield_11297?.value ?? null);
    if ((it.Modulo || null) !== (liveMod || null)) record('Modulo↔cf11297', it.Key, it.Modulo, liveMod);
    // Jornada ↔ cf12386 (compara como conjunto)
    const liveJor = ((f.customfield_12386 || []) as string[]).slice().sort().join('|');
    if ((it.Jornada || []).slice().sort().join('|') !== liveJor) record('Jornada↔cf12386', it.Key, it.Jornada, f.customfield_12386);
  }

  const checked = chosen.length - notFound;
  console.log(`Itens conferidos: ${checked} (não encontrados no Jira: ${notFound})\n`);
  const fields = Object.keys(mismatches);
  if (fields.length === 0) {
    console.log('✅ Nenhuma divergência — o dataset bate com o Jira nos campos verificados.');
  } else {
    console.log('⚠️  Divergências (podem ser staleness do sync OU bug de mapeamento):');
    for (const field of fields) {
      const m = mismatches[field];
      console.log(`\n  ${field}: ${m.count}/${checked}`);
      m.examples.forEach(e => console.log(`     ${e}`));
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
