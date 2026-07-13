import 'dotenv/config';

async function sample() {
  const baseUrl = process.env.JIRA_BASE_URL;
  const email = process.env.JIRA_USER_EMAIL;
  const token = process.env.JIRA_API_TOKEN;
  
  if (!baseUrl || !email || !token) return;

  const credentials = Buffer.from(`${email}:${token}`).toString('base64');
  const authHeader = `Basic ${credentials}`;
  
  const jql = encodeURIComponent('project = "WA" AND (fixVersion is not EMPTY OR "Release[Labels]" is not EMPTY OR "Release[Dropdown]" is not EMPTY) ORDER BY created DESC');
  const url = `${baseUrl}/rest/api/3/search/jql?jql=${jql}&maxResults=1&fields=*all`;

  const res = await fetch(url, { headers: { 'Authorization': authHeader, 'Accept': 'application/json' }});
  const data = await res.json();
  if (data.issues && data.issues.length > 0) {
      const i = data.issues[0];
      console.log("Issue:", i.key);
      console.log("Fields object present:", !!i.fields);
      if (i.fields) {
        console.log("Time (11795):", i.fields.customfield_11795);
        console.log("Team (10001):", i.fields.customfield_10001);
        console.log("Release (11330):", i.fields.customfield_11330);
        console.log("FixVersions:", i.fields.fixVersions);
      }
  }
}
sample();
