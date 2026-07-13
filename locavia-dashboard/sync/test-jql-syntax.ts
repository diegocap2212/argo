import 'dotenv/config';

async function test() {
  const baseUrl = process.env.JIRA_BASE_URL;
  const email = process.env.JIRA_USER_EMAIL;
  const token = process.env.JIRA_API_TOKEN;
  const auth = `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`;

  const tests = [
    'Jornada in ("WHATSAPP")',
    '"Jornada[Labels]" in ("WHATSAPP")',
    'Release in ("O4R1")',
    '"Release[Labels]" in ("O4R1")',
    'cf[12386] in ("WHATSAPP")', // Jornada ID
    'cf[11330] in ("O4R1")'      // Release ID
  ];

  console.log("Testando sintaxes JQL para WA-747...");

  for (const snippet of tests) {
    const jql = `key = WA-747 and ${snippet}`;
    const url = `${baseUrl}/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}`;
    
    try {
      const res = await fetch(url, { headers: { 'Authorization': auth, 'Accept': 'application/json' } });
      const data = await res.json();
      
      if (res.ok) {
        console.log(`- ${snippet}: ${data.total > 0 ? 'MATCH' : 'NO MATCH'}`);
      } else {
        console.log(`- ${snippet}: ERROR (${res.status}) - ${data.errorMessages ? data.errorMessages[0] : 'Unknown'}`);
      }
    } catch (e) {
      console.log(`- ${snippet}: FETCH ERROR`);
    }
  }
}
test();
