/**
 * Classificação de erro de consulta ao Supabase.
 *
 * O PROBLEMA (achado 6.11 do review de 2026-07-27): vários hooks faziam
 *
 *     if (error) { devWarn("...", error.message); return []; }
 *
 * e `devWarn` é NO-OP em produção. Ou seja: em produção o erro desaparecia por completo e a
 * tela mostrava lista vazia. "Não há dados", "você não tem permissão" e "o banco está fora"
 * ficavam visualmente idênticos — e alguém decide sobre uma tela vazia sem saber que houve
 * falha. É fail-closed em privilégio (não vaza nada) e fail-SILENT em operação, que é a pior
 * combinação para confiança no número.
 *
 * A distinção que importa não é "erro ou não", é:
 *
 *   · RECURSO AUSENTE (42P01, `relation does not exist`) — esperado em janela de migração,
 *     quando o app novo sobe antes da view existir. Tolerar é correto; ficar calado não.
 *   · PERMISSÃO (42501 / RLS) — não é falha, é resposta: a pessoa não tem aquele papel. Lista
 *     vazia é a representação certa, mas a UI deveria poder dizer "sem acesso" em vez de
 *     "sem dados".
 *   · QUALQUER OUTRA COISA — rede, timeout, view quebrada, coluna renomeada. Isto é FALHA, e
 *     precisa chegar ao React Query como erro para a tela mostrar estado de erro em vez de
 *     fingir que o resultado é vazio.
 */

export interface SupabaseishError {
  message?: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
}

/** `relation ... does not exist` — a tabela/view ainda não foi criada neste ambiente. */
export function isMissingRelation(error: SupabaseishError | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "42P01") return true;
  return /does not exist|não existe/i.test(error.message ?? "");
}

/** Negado por RLS ou por privilégio. Não é falha: é a resposta. */
export function isPermissionDenied(error: SupabaseishError | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "42501" || error.code === "PGRST301") return true;
  return /permission denied|row-level security|not authorized/i.test(error.message ?? "");
}

export type QueryFallback = "vazio-por-ausencia" | "vazio-por-permissao";

/**
 * Decide o que fazer com um erro de consulta.
 *
 * Devolve o motivo quando a lista vazia é resposta legítima; LANÇA quando é falha de verdade.
 * Lançar é o ponto: o React Query passa a expor `isError`, e a tela pode dizer "não consegui
 * carregar" em vez de "nada aqui".
 *
 * Em todos os casos o erro vai para `console.error` — não `devWarn`, que é silencioso em
 * produção, que é exatamente onde a informação faz falta.
 */
export function classifyQueryError(
  context: string,
  error: SupabaseishError,
): QueryFallback {
  if (isMissingRelation(error)) {
    console.error(`[${context}] recurso ausente (janela de migração?): ${error.message}`);
    return "vazio-por-ausencia";
  }
  if (isPermissionDenied(error)) {
    console.error(`[${context}] acesso negado pela política do banco: ${error.message}`);
    return "vazio-por-permissao";
  }
  // Falha real: propaga. Mensagem estável para a UI; detalhe no console.
  console.error(`[${context}] falha ao consultar:`, error);
  throw new Error(
    `Não foi possível carregar os dados (${context}). Tente novamente; se persistir, avise o time.`,
  );
}
