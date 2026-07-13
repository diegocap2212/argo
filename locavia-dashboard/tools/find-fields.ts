import 'dotenv/config';
import { JiraClient } from './sync/jira-client';

async function main() {
  const baseUrl = process.env.JIRA_BASE_URL;
  const email = process.env.JIRA_USER_EMAIL;
  const token = process.env.JIRA_API_TOKEN;

  if (!baseUrl || !email || !token) {
    console.error("ERRO: Faltam variáveis de ambiente");
    return;
  }

  const client = new JiraClient(baseUrl, email, token);
  const fields = await client.getFields();
  
  const targets = ["Automação", "Natureza da Demanda", "Jornada", "Release", "Time"];
  
  console.log("Campos encontrados:");
  for (const field of fields) {
    if (targets.some(t => field.name.includes(t))) {
      console.log(`- ${field.name} (${field.id}): ${field.clauseNames.join(', ')}`);
    }
  }
}

main();
