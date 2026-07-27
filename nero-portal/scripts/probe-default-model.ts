/**
 * Sonda de PROCESSO SEPARADO para o teste da allowlist de modelos.
 *
 * `DEFAULT_MODEL` é resolvido UMA vez, na carga do módulo `lib/nero/core.ts`. Por isso o
 * teste principal (`test-nero-core.ts`) não consegue exercitar `NERO_MODEL`: quando ele
 * mexe em `process.env`, o módulo já foi importado e a constante já está congelada. Foi
 * exatamente essa cegueira que deixou passar o `as NeroModelId` sem validação de runtime.
 *
 * Este arquivo é lançado com envs controladas e imprime o resultado em JSON na stdout.
 * Não é um teste: é o instrumento de medida do teste.
 */
import { DEFAULT_MODEL, NERO_MODELS, resolveModel } from "../src/lib/nero/core";

// A checagem de allowlist é feita AQUI, a partir de NERO_MODELS, e não importando o
// predicado de core.ts. Motivo: esta sonda precisa rodar contra QUALQUER versão do módulo
// para que o teste meça comportamento. Importar um símbolo que só existe na versão
// corrigida faria a sonda falhar por erro de import — o teste ficaria "verde depois,
// vermelho antes" sem provar nada sobre o bug.
const allowed: readonly string[] = Object.values(NERO_MODELS);

console.log(
  JSON.stringify({
    default: DEFAULT_MODEL,
    // O que um request SEM modelo explícito acabaria usando.
    resolvedFromUndefined: resolveModel(undefined),
    // O que um cliente malicioso pedindo um modelo caro acabaria usando.
    resolvedFromBogus: resolveModel("claude-opus-4-8"),
    defaultIsAllowed: allowed.includes(DEFAULT_MODEL),
  }),
);
