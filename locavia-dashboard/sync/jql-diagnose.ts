import 'dotenv/config';

async function diagnose() {
  const auth = `Basic ${Buffer.from(`${process.env.JIRA_USER_EMAIL}:${process.env.JIRA_API_TOKEN}`).toString('base64')}`;
  
  const snippets = [
    'cf[12386] = WHATSAPP',
    'cf[12386] in (WHATSAPP)',
    'cf[11330] = O4R1',
    'cf[11330] in (O4R1)',
    '"Jornada[Labels]" = WHATSAPP',
    '"Release[Labels]" = O4R1',
    'project = WA'
  ];

  for (const s of snippets) {
    const jql = `key = WA-747 and ${s}`;
    const url = `${process.env.JIRA_BASE_URL}/rest/api/3/search?jql=${encodeURIComponent(jql)}`;
    const res = await fetch(url, { headers: { 'Authorization': auth } });
    const data = await res.json();
    console.log(`${s}: ${data.total > 0 ? 'MATCH' : 'NO MATCH'}`);
  }
}
diagnose();
