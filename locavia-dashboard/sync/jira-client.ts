import { JiraApiIssue, StatusTransition } from '../src/types/jira';
import type { JiraSearchResponse } from './jira-json';

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

  // Genérico em vez de `any`: cada chamador declara a forma que espera, e a asserção de
  // forma fica num só lugar (mesma ideia de sync/jira-json.ts, usado pelos diagnósticos).
  private async request<T = unknown>(endpoint: string, options: RequestInit = {}): Promise<T> {
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

        return (await response.json()) as T;
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
  async searchIssues(jql: string, fields: string[] = ['summary', 'status', 'issuetype', 'created', 'updated', 'labels', 'parent', 'customfield_11330', 'customfield_12386', 'customfield_11795', 'customfield_11297', 'customfield_13338', 'customfield_10001', 'customfield_10215', 'customfield_13065', 'customfield_12683', 'customfield_10102', 'customfield_10015', 'customfield_10165', 'customfield_12584', 'customfield_12585', 'customfield_10026', 'customfield_10016', 'resolutiondate', 'assignee', 'priority', 'fixVersions']): Promise<JiraApiIssue[]> {
    const allIssues: JiraApiIssue[] = [];
    let nextPageToken: string | undefined = undefined;
    const maxResults = 100;
    let isLast = false;

    while (!isLast) {
      console.log(`Buscando lote de issues (token: ${nextPageToken || 'inicial'})...`);
      
      const body: Record<string, unknown> = {
        jql,
        maxResults,
        fields,
        fieldsByKeys: false,
        expand: 'changelog'
      };
      
      if (nextPageToken) {
        body.nextPageToken = nextPageToken;
      }

      const data = await this.request<JiraSearchResponse>('/search/jql', {
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

  /**
   * Changelog COMPLETO por issue, via `POST /rest/api/3/changelog/bulkfetch`.
   *
   * POR QUE ISTO EXISTE (achado 5.6 do review de 2026-07-27): `searchIssues` usa
   * `expand: 'changelog'`, e o expand da BUSCA devolve histórico PARCIAL — o Jira corta as
   * entradas por issue e a resposta da busca não diz que cortou. Quem consome isso aqui é o
   * `metrics-calculator`: `TimeInStatus` (cycle time por etapa) e `TimeInTodo` são
   * reconstruídos transição por transição. Com histórico truncado, os dois saem errados e com
   * a MESMA aparência de corretos.
   *
   * O endpoint bulkfetch aceita até 1.000 issues por chamada e pagina por `nextPageToken`.
   *
   * Devolve, por `issueId`, as transições E se o histórico está completo — porque uma métrica
   * derivada de histórico nunca deve parecer confiável quando o histórico é parcial.
   */
  async bulkFetchChangelogs(
    issueIds: string[],
  ): Promise<Map<string, { histories: StatusTransition[]; total: number; complete: boolean }>> {
    // Chaveado por issueId (NUMÉRICO), porque é assim que a resposta do bulkfetch identifica
    // cada entrada. Passar `issue.key` aqui e tentar casar por `issueId` devolveria mapa vazio
    // para TODAS as issues — e o sync seguiria felizmente com changelog nenhum, que é
    // exatamente o tipo de silêncio que este trabalho está eliminando.
    const out = new Map<string, { histories: StatusTransition[]; total: number; complete: boolean }>();
    if (issueIds.length === 0) return out;

    // Teto do endpoint. Não é ajustável: 1.000 é o limite documentado por request.
    const LOTE = 1000;

    for (let i = 0; i < issueIds.length; i += LOTE) {
      const lote = issueIds.slice(i, i + LOTE);
      let nextPageToken: string | undefined;
      let pagina = 0;

      // Um lote pode precisar de várias páginas: o limite é de ENTRADAS de changelog, não de
      // issues. Issue com histórico longo consome página inteira.
      do {
        const body: Record<string, unknown> = { issueIdsOrKeys: lote };
        if (nextPageToken) body.nextPageToken = nextPageToken;

        const data = await this.request<{
          issueChangeLogs?: Array<{
            issueId: string;
            changeHistories?: Array<{ created: string; items?: Array<Record<string, unknown>> }>;
          }>;
          nextPageToken?: string;
        }>('/changelog/bulkfetch', { method: 'POST', body: JSON.stringify(body) });

        for (const entrada of data.issueChangeLogs ?? []) {
          const chave = entrada.issueId;
          const atual = out.get(chave) ?? { histories: [], total: 0, complete: true };
          for (const h of entrada.changeHistories ?? []) {
            atual.histories.push({
              created: h.created,
              items: (h.items ?? []).map((it) => ({
                field: String(it.field ?? ''),
                fromString: String(it.fromString ?? ''),
                toString: String(it.toString ?? ''),
              })),
            });
          }
          atual.total = atual.histories.length;
          out.set(chave, atual);
        }

        nextPageToken = data.nextPageToken;
        pagina++;
        // Guarda contra paginação infinita. Marca INCOMPLETO em vez de truncar em silêncio —
        // é a diferença entre "não sei" e "sei que está errado".
        if (pagina > 200) {
          for (const v of out.values()) v.complete = false;
          console.warn('[jira] bulkfetch de changelog excedeu 200 páginas; histórico marcado como INCOMPLETO');
          break;
        }
      } while (nextPageToken);

      console.log(`Changelog: lote ${i / LOTE + 1} (${lote.length} issues, ${pagina} página(s)).`);
    }

    return out;
  }

  // Lista todos os campos disponíveis (para descobrir custom fields)
  // `clauseNames` faltava neste tipo e tools/find-fields.ts já o usava — só apareceu quando
  // `sync/` e `tools/` entraram no typecheck (2026-07-27). A API /field devolve o campo.
  async getFields(): Promise<
    { id: string; name: string; custom: boolean; clauseNames: string[]; schema?: unknown }[]
  > {
    return this.request('/field');
  }
}
