import dotenv from 'dotenv';
// As credenciais locais vivem em .env.local (produção recebe via secrets do GitHub Actions).
dotenv.config({ path: '.env.local' });
dotenv.config(); // fallback para .env / env do CI
import { JiraClient } from './jira-client';
import { readIssueResponse, readSearchResponse } from './jira-json';
import type { JiraApiIssue } from '../src/types/jira';

/**
 * Descobre qual custom field guarda "Módulo" / o valor "Erro de processo".
 *
 * Uso:
 *   npx tsx sync/discover-modulo.ts               → busca itens do tipo "Script Manual"
 *   npx tsx sync/discover-modulo.ts RM-6326       → inspeciona uma issue específica
 *
 * Estratégia (não depende do catálogo de campos, que pode estar restrito para o token):
 *   varre TODOS os customfield_* dos itens e reporta qual carrega "Erro de processo".
 *
 * Requer .env.local com JIRA_BASE_URL / JIRA_USER_EMAIL / JIRA_API_TOKEN de um token
 * COM acesso de leitura aos projetos LM (o token restrito não enxerga issues).
 */

const TARGET = 'erro de processo';

async function main() {
  const baseUrl = process.env.JIRA_BASE_URL;
  const email = process.env.JIRA_USER_EMAIL;
  const token = process.env.JIRA_API_TOKEN;
  if (!baseUrl || !email || !token) {
    console.error('❌ Faltam JIRA_BASE_URL / JIRA_USER_EMAIL / JIRA_API_TOKEN (.env.local).');
    process.exit(1);
  }

  const base = baseUrl.replace(/\/$/, '');
  const cred = Buffer.from(`${email}:${token}`).toString('base64');
  const headers = { Authorization: `Basic ${cred}`, Accept: 'application/json', 'Content-Type': 'application/json' };

  // Mapa id→nome (best-effort; token restrito pode não listar custom fields).
  let idToName = new Map<string, string>();
  try {
    const fields = await new JiraClient(baseUrl, email, token).getFields();
    idToName = new Map(fields.map(f => [f.id, f.name]));
    console.log(`Catálogo de campos: ${fields.length} campos visíveis.`);
    if (fields.length < 50) {
      console.warn('⚠️  Poucos campos visíveis — token provavelmente sem acesso aos custom fields.');
    }
  } catch {
    console.warn('⚠️  getFields() falhou — seguindo sem nomes de campo.');
  }

  const argKey = process.argv[2];
  let issues: JiraApiIssue[] = [];

  if (argKey) {
    const res = await fetch(`${base}/rest/api/3/issue/${encodeURIComponent(argKey)}?fields=*all`, { headers });
    if (!res.ok) { console.error(`❌ ${argKey}: ${res.status} ${res.statusText} — passe uma key válida e visível ao token.`); process.exit(1); }
    issues = [await readIssueResponse(res)];
  } else {
    const res = await fetch(`${base}/rest/api/3/search/jql`, {
      method: 'POST', headers,
      body: JSON.stringify({ jql: 'issuetype = "Script Manual" ORDER BY updated DESC', maxResults: 50, fields: ['*all'] }),
    });
    if (!res.ok) { console.error(`❌ Busca falhou: ${res.status} — ${(await res.text()).slice(0, 200)}`); process.exit(1); }
    issues = (await readSearchResponse(res)).issues ?? [];
  }

  console.log(`\nItens analisados: ${issues.length}`);
  if (issues.length === 0) {
    console.error('⚠️  Nenhum item retornado. Verifique o acesso do token aos projetos LM.');
    process.exit(1);
  }

  const hits = new Map<string, Set<string>>();
  const selects = new Map<string, Set<string>>();
  for (const issue of issues) {
    const f = issue.fields || {};
    for (const key of Object.keys(f)) {
      if (!key.startsWith('customfield_')) continue;
      const v = f[key];
      if (v == null || (Array.isArray(v) && v.length === 0)) continue;
      const s = JSON.stringify(v);
      if (s.toLowerCase().includes(TARGET)) {
        if (!hits.has(key)) hits.set(key, new Set());
        hits.get(key)!.add(s.slice(0, 160));
      }
      if (v && typeof v === 'object' && !Array.isArray(v) && 'value' in v) {
        if (!selects.has(key)) selects.set(key, new Set());
        const sel = v as { value?: unknown; child?: { value?: unknown } };
        selects.get(key)!.add(String(sel.value) + (sel.child ? ` > ${String(sel.child.value)}` : ''));
      }
    }
  }

  console.log('\n⭐ Campo(s) que contêm "Erro de processo":');
  if (hits.size === 0) console.log('   (nenhum — talvez o valor esteja escrito diferente ou o item não tenha Módulo)');
  for (const [k, vals] of hits) console.log(`   ${k} «${idToName.get(k) || '?'}»\n      ${[...vals].join('\n      ')}`);

  console.log('\n── Campos select/cascading vistos nesses itens (candidatos a "Módulo") ──');
  for (const [k, vals] of selects) console.log(`   ${k} «${idToName.get(k) || '?'}»: ${[...vals].slice(0, 12).join(' | ')}`);

  const isAutomacao = hits.has('customfield_13065');
  console.log('\n════════════════════════════════════════════');
  if (isAutomacao) {
    console.log('❗ "Erro de processo" está em customfield_13065 (Automação).');
    console.log('   → Esses itens são EXCLUÍDOS pelo sync (cf[13065] is EMPTY em sync-jira.ts:57).');
    console.log('   → Frente B1: ajustar a JQL para incluí-los + mapear o campo.');
  } else if (hits.size) {
    console.log(`✅ Módulo/Erro de processo = ${[...hits.keys()].join(', ')} (campo separado).`);
    console.log('   → Frente B1: adicionar esse customfield à lista de fields do jira-client e mapear no field-mapper.');
  }
}

main().catch(err => { console.error('Erro:', err); process.exit(1); });
