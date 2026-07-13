import 'dotenv/config';

async function diagnose() {
  const auth = `Basic ${Buffer.from(`${process.env.JIRA_USER_EMAIL}:${process.env.JIRA_API_TOKEN}`).toString('base64')}`;
  
  const conditions = [
    'project = WA',
    'type not in (Epic, subTaskIssueTypes())',
    '("Release[Labels]" in ("O4R1") or "Jornada[Labels]" in ("WHATSAPP"))',
    '"Automação[Select List (cascading)]" = EMPTY',
    '("Natureza da Demanda[Labels]" not in (TESTES-LOCAVIA) or "Natureza da Demanda[Labels]" is EMPTY)'
  ];

  console.log("Validando partes do JQL para WA-747...");
  
  for (const cond of conditions) {
    const jql = `key = WA-747 and ${cond}`;
    const url = `${process.env.JIRA_BASE_URL}/rest/api/3/search?jql=${encodeURIComponent(jql)}`;
    const res = await fetch(url, { headers: { 'Authorization': auth } });
    const data = await res.json();
    console.log(`- ${cond}: ${data.total > 0 ? 'PASS' : 'FAIL'}`);
  }
  
  // Test complete JQL
  const fullJql = conditions.join(' and ');
  const resFull = await fetch(`${process.env.JIRA_BASE_URL}/rest/api/3/search?jql=${encodeURIComponent('key = WA-747 and ' + fullJql)}`, { headers: { 'Authorization': auth } });
  const dataFull = await resFull.json();
  console.log(`\n- JQL COMPLETO para WA-747: ${dataFull.total > 0 ? 'PASS' : 'FAIL'}`);
}
diagnose();
