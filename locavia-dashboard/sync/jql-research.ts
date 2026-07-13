import 'dotenv/config';

async function research() {
  const baseUrl = process.env.JIRA_BASE_URL;
  const email = process.env.JIRA_USER_EMAIL;
  const token = process.env.JIRA_API_TOKEN;
  
  const jqlBase = `project is not empty and type not in (Epic, subTaskIssueTypes()) and ("Release[Labels]" in (O4R1,O4R2,BAF,BAF-QW) or "Jornada[Labels]" in (COMPRAS, ESTOQUE, MOB,LAKE-DOMINIO)) and "Automação[Select List (cascading)]" = EMPTY and ("Natureza da Demanda[Labels]" not in (TESTES-LOCAVIA) or "Natureza da Demanda[Labels]" is EMPTY)`;

  const windows = [30, 90, 180, 365];
  
  console.log("Pesquisando total de issues por janela de tempo (updated)...");
  
  for (const days of windows) {
    const jql = `${jqlBase} AND updated >= -${days}d`;
    const url = `${baseUrl}/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&maxResults=0`;
    const res = await fetch(url, {
       headers: { 'Authorization': `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`, 'Accept': 'application/json' }
    });
    const data = await res.json();
    if (!res.ok) {
        console.error(`Error ${res.status}: ${JSON.stringify(data)}`);
    } else {
        console.log(`- Last ${days} days: ${data.total} issues`);
    }
  }
}
research();
