import 'dotenv/config';
import { JiraClient } from './jira-client';

async function compare() {
  const baseUrl = process.env.JIRA_BASE_URL;
  const email = process.env.JIRA_USER_EMAIL;
  const token = process.env.JIRA_API_TOKEN;
  
  if (!baseUrl || !email || !token) return;

  const client = new JiraClient(baseUrl, email, token);
  
  const keys = ['WA-747', 'WA-696', 'WA-676']; // Sample from CSV

  console.log("Comparando chaves do CSV com a API...");
  
  for (const key of keys) {
    try {
      const res = await fetch(`${baseUrl}/rest/api/3/issue/${key}`, {
         headers: { 'Authorization': `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`, 'Accept': 'application/json' }
      });
      const issue = await res.json();
      
      console.log(`\n--- ${key} ---`);
      console.log(`CSV Status: (See above)`);
      console.log(`API Status: ${issue.fields.status.name}`);
      console.log(`API customfield_11795 (Time):`, issue.fields.customfield_11795);
      console.log(`API customfield_11330 (Release):`, issue.fields.customfield_11330);
      console.log(`API customfield_12386 (JornadaLabels):`, issue.fields.customfield_12386);
      console.log(`API customfield_13065 (Automação):`, issue.fields.customfield_13065);
      console.log(`API customfield_12683 (Natureza):`, issue.fields.customfield_12683);
    } catch (e) {
      console.error(`Error fetching ${key}`, e);
    }
  }
}
compare();
