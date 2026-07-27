/**
 * A ÚNICA conversão de resposta JSON do Jira no pipeline de sync.
 *
 * POR QUE EXISTE: o `fetch` do Node (undici, via @types/node) declara
 * `Response.json(): Promise<unknown>` — diferente do `lib.dom`, que devolve `any` e deixa
 * qualquer acesso passar em silêncio. Quando `sync/` entrou no typecheck
 * (tsconfig.tools.json, 2026-07-27) esses acessos apareceram todos de uma vez, em 8
 * arquivos. Concentrar a conversão aqui evita a alternativa preguiçosa (`as any` espalhado,
 * que também violaria o `no-explicit-any` do eslint agora que `sync/` é lintado) e dá um
 * lugar único para apertar o contrato se um campo passar a importar.
 *
 * NÃO é validação: é uma asserção de forma na fronteira. A validação de verdade do dataset
 * é o schema zod em `sync-jira.ts`.
 */
import type { JiraApiIssue } from '../src/types/jira';

/** Resposta de `/rest/api/3/search/jql` (Enhanced Search) e variantes. */
export interface JiraSearchResponse {
  issues?: JiraApiIssue[];
  total?: number;
  nextPageToken?: string;
  errorMessages?: string[];
}

/** Resposta de `/rest/api/3/issue/{key}`. */
export async function readIssueResponse(res: Response): Promise<JiraApiIssue> {
  return (await res.json()) as JiraApiIssue;
}

/** Resposta de busca por JQL. Campos opcionais: o Jira omite `issues` em erro. */
export async function readSearchResponse(res: Response): Promise<JiraSearchResponse> {
  return (await res.json()) as JiraSearchResponse;
}
