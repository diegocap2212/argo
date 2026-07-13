import 'dotenv/config';
import { JiraClient } from './jira-client';
import fs from 'fs/promises';

async function discover() {
  const baseUrl = process.env.JIRA_BASE_URL;
  const email = process.env.JIRA_USER_EMAIL;
  const token = process.env.JIRA_API_TOKEN;

  if (!baseUrl || !email || !token) {
    console.error("Missing JIRA variables in .env");
    process.exit(1);
  }

  const client = new JiraClient(baseUrl, email, token);

  try {
    console.log("Conectando e buscando campos customizados...");
    const fields = await client.getFields();
    
    console.log(`Total de campos: ${fields.length}`);
    
    // Search for the specific fields mentioned in JQL
    const targetNames = ['Release', 'Jornada', 'Automação', 'Natureza da Demanda', 'Team', 'Time'];
    
    fields.forEach(f => {
      const match = targetNames.some(t => f.name.toLowerCase().includes(t.toLowerCase()));
      if (match) {
        console.log(`- ${f.name} (ID: ${f.id}) [Custom: ${f.custom}]`);
      }
    });

    // Also dump all for safety
    await fs.writeFile('sync/all_fields_dump.json', JSON.stringify(fields, null, 2));

  } catch (error) {
    console.error("Erro na request:", error);
  }
}

discover();
