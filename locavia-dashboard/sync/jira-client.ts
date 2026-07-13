import { JiraApiIssue } from '../src/types/jira';

// Teto de itens por sync. Acima disso, o sync FALHA explicitamente (não trunca em silêncio).
const MAX_ISSUES = Number(process.env.JIRA_MAX_ISSUES || 30000);
const MAX_RETRIES = 4;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export class JiraClient {
  private baseUrl: string;
  private authHeader: string;

  constructor(baseUrl: string, email: string, apiToken: string) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    const credentials = Buffer.from(`${email}:${apiToken}`).toString('base64');
    this.authHeader = `Basic ${credentials}`;
  }

  private async request(endpoint: string, options: RequestInit = {}): Promise<any> {
    const url = `${this.baseUrl}/rest/api/3${endpoint}`;

    const headers = new Headers(options.headers || {});
    headers.set('Authorization', this.authHeader);
    headers.set('Accept', 'application/json');
    if (options.method === 'POST' || options.method === 'PUT') {
      headers.set('Content-Type', 'application/json');
    }

    let lastErr: unknown;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(url, { ...options, headers });

        // 429 / 5xx → transitório: espera (Retry-After ou backoff exponencial) e tenta de novo.
        if (response.status === 429 || response.status >= 500) {
          if (attempt < MAX_RETRIES) {
            const retryAfter = Number(response.headers.get('retry-after')) || 0;
            const backoff = retryAfter > 0 ? retryAfter * 1000 : Math.min(1000 * 2 ** attempt, 16000);
            console.warn(`Jira ${response.status} — retry em ${backoff}ms (tentativa ${attempt + 1}/${MAX_RETRIES})`);
            await sleep(backoff);
            continue;
          }
        }

        if (!response.ok) {
          let errorDetail = '';
          try { errorDetail = JSON.stringify(await response.json()); }
          catch { errorDetail = await response.text(); }
          throw new Error(`Jira API Error: ${response.status} ${response.statusText} at ${url}\nDetails: ${errorDetail}`);
        }

        return response.json();
      } catch (err) {
        lastErr = err;
        // Erro de rede (não-HTTP): backoff e retry.
        const isHttp = err instanceof Error && err.message.startsWith('Jira API Error:');
        if (isHttp || attempt >= MAX_RETRIES) throw err;
        const backoff = Math.min(1000 * 2 ** attempt, 16000);
        console.warn(`Falha de rede no Jira — retry em ${backoff}ms (tentativa ${attempt + 1}/${MAX_RETRIES})`);
        await sleep(backoff);
      }
    }
    throw lastErr;
  }

  // Busca issues via Enhanced Search (JQL) com paginação por tokens
  async searchIssues(jql: string, fields: string[] = ['summary', 'status', 'issuetype', 'created', 'updated', 'labels', 'customfield_11330', 'customfield_12386', 'customfield_11795', 'customfield_10001', 'customfield_10215', 'customfield_13065', 'customfield_12683', 'customfield_10102', 'customfield_10015', 'customfield_10165', 'customfield_12584', 'customfield_12585', 'customfield_10026', 'customfield_10016', 'resolutiondate', 'assignee', 'priority', 'fixVersions']): Promise<JiraApiIssue[]> {
    const allIssues: JiraApiIssue[] = [];
    let nextPageToken: string | undefined = undefined;
    const maxResults = 100;
    let isLast = false;

    while (!isLast) {
      console.log(`Buscando lote de issues (token: ${nextPageToken || 'inicial'})...`);
      
      const body: any = {
        jql,
        maxResults,
        fields,
        fieldsByKeys: false,
        expand: 'changelog'
      };
      
      if (nextPageToken) {
        body.nextPageToken = nextPageToken;
      }

      const data = await this.request('/search/jql', {
        method: 'POST',
        body: JSON.stringify(body)
      });

      if (data.issues && data.issues.length > 0) {
        allIssues.push(...data.issues);
      }

      nextPageToken = data.nextPageToken;

      // Estouro do teto: aborta com erro claro em vez de truncar silenciosamente.
      if (allIssues.length >= MAX_ISSUES && nextPageToken) {
        throw new Error(`Limite de ${MAX_ISSUES} itens atingido e ainda há mais dados no Jira. ` +
          `Aumente JIRA_MAX_ISSUES ou restrinja o JQL para não perder itens silenciosamente.`);
      }
      isLast = !nextPageToken;
    }

    return allIssues;
  }

  // Lista todos os campos disponíveis (para descobrir custom fields)
  async getFields(): Promise<{ id: string; name: string; custom: boolean; schema?: any }[]> {
    return this.request('/field');
  }
}
