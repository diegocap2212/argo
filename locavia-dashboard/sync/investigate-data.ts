import 'dotenv/config';
import { JiraClient } from './jira-client';

async function investigate() {
  const baseUrl = process.env.JIRA_BASE_URL;
  const email = process.env.JIRA_USER_EMAIL;
  const token = process.env.JIRA_API_TOKEN;
  
  if (!baseUrl || !email || !token) return;

  const client = new JiraClient(baseUrl, email, token);
  
  // Use the official JQL
  const jql = `project is not empty and type not in (Epic, subTaskIssueTypes()) and ("Release[Labels]" in (O4R1,O4R2,BAF,BAF-QW) or "Jornada[Labels]" in (COMPRAS, ESTOQUE, MOB,LAKE-DOMINIO)) and "Automação[Select List (cascading)]" = EMPTY and ("Natureza da Demanda[Labels]" not in (TESTES-LOCAVIA) or "Natureza da Demanda[Labels]" is EMPTY) ORDER BY created DESC`;

  console.log("Investigando amostra de dados com JQL oficial...");
  
  try {
    // Calling search directly to avoid the pagination loop for investigation
    const res = await fetch(`${baseUrl}/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&maxResults=20&fields=*all`, {
       headers: { 'Authorization': `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`, 'Accept': 'application/json' }
    });
    const data = await res.json();
    const issues = data.issues || [];
    console.log(`Amostra de ${issues.length} issues obtida.`);
    
    if (issues.length > 0) {
      const sample = issues; 
      sample.forEach((i: any) => {
        console.log(`\n--- Issue: ${i.key} ---`);
        console.log(`Summary: ${i.fields.summary}`);
        console.log(`Status: ${i.fields.status.name} (Category: ${i.fields.status.statusCategory.name})`);
        console.log(`Time (11795):`, i.fields.customfield_11795);
        console.log(`Time ou Fila (10159):`, i.fields.customfield_10159);
        console.log(`Fila ou Time (10160):`, i.fields.customfield_10160);
        console.log(`Team (10001):`, i.fields.customfield_10001);
        console.log(`Release (11330):`, i.fields.customfield_11330);
        console.log(`Jornada (10215):`, i.fields.customfield_10215);
        console.log(`Jornada (12386):`, i.fields.customfield_12386);
        console.log(`FixVersions:`, i.fields.fixVersions.map((v: any) => v.name));
      });
    }
  } catch (e) {
    console.error(e);
  }
}
investigate();
