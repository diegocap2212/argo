import { NERO_TOOLS } from "./tools";
import type Anthropic from "@anthropic-ai/sdk";

/**
 * Política de ferramentas, decidida pelo SERVIDOR e não pelo modelo.
 *
 * O PROBLEMA (achado 7.8): `streamTurn` passava `NERO_TOOLS` inteiro em TODO turno, incluindo
 * o chat tutor da Academia. Ou seja: um chat cuja finalidade é ENSINAR podia gravar decisão,
 * mudar status de fase e sobrescrever o catálogo do projeto. E como o contexto carrega texto
 * editável por qualquer usuário, bastava um conteúdo injetado numa nota para tentar acionar
 * essas escritas — sem nenhuma aprovação humana no caminho.
 *
 * "Peça confirmação antes de escrever" no prompt não é controle: é sugestão a um componente
 * probabilístico. Controle é o servidor não oferecer a ferramenta.
 *
 * PRINCÍPIO: cada superfície recebe o MENOR conjunto que cumpre sua função.
 */

/** Tools que só LEEM — seguras em qualquer superfície. */
const SOMENTE_LEITURA = ["consultar_biblioteca", "ler_documento"] as const;

export type ToolScope =
  /** Chat principal (`/`) e chat escopado de fase (`/roadmap`): o Nero operando o projeto. */
  | "projeto"
  /** Chat tutor da Academia: ensina. Não mexe no estado do projeto. */
  | "academia"
  /** Geração one-shot do report: um turno, sem ferramenta nenhuma. */
  | "report";

/**
 * Conjunto de tools por escopo.
 *
 * `academia` fica só com leitura DE PROPÓSITO: o tutor precisa consultar a Biblioteca para
 * ensinar, e não precisa de mais nada. Se um dia a Academia precisar escrever (registrar
 * conclusão de trilha, por exemplo), isso entra como tool PRÓPRIA e explícita — não abrindo o
 * conjunto do projeto inteiro.
 */
export function toolsForScope(scope: ToolScope): Anthropic.Tool[] | undefined {
  if (scope === "report") return undefined; // sem tools: geração determinística de texto
  if (scope === "academia") {
    return NERO_TOOLS.filter((t) => (SOMENTE_LEITURA as readonly string[]).includes(t.name));
  }
  return NERO_TOOLS;
}

/**
 * Barreira de EXECUÇÃO, e não só de oferta.
 *
 * Filtrar a lista impede o modelo de conhecer a ferramenta; esta função impede a execução
 * mesmo que ele invente o nome (acontece — modelo alucina tool que não existe, ou repete uma
 * de um turno anterior de outro escopo). Sem isto, `runNeroTool` executaria qualquer nome que
 * chegasse ao laço agêntico.
 */
export function isToolAllowed(scope: ToolScope, toolName: string): boolean {
  const permitidas = toolsForScope(scope);
  if (!permitidas) return false;
  return permitidas.some((t) => t.name === toolName);
}

/** Escopo a partir do corpo da requisição de chat. Default é o mais restrito que serve. */
export function scopeFromRequest(opts: { trilhaSlug?: string; stepSlug?: string }): ToolScope {
  return opts.trilhaSlug && opts.stepSlug ? "academia" : "projeto";
}
