/**
 * Prefixo da rota do Nero dentro do Portal NEO.
 *
 * O Nero é a porta 03 do portal e é servido em https://neo-lm.vercel.app/nero — o projeto
 * `neo-lm` faz rewrite de /nero/** para o deployment deste app (ver vercel.json da raiz).
 *
 * FONTE ÚNICA: `next.config.ts` importa BASE_PATH daqui, então o prefixo existe em um só
 * lugar. Mudar aqui muda o basePath do Next junto.
 *
 * O QUE PRECISA DO HELPER `api()`:
 *   - `fetch()` com caminho absoluto  → NÃO recebe o basePath automaticamente
 *   - `<a href="/...">` cru           → NÃO recebe (use `next/link`, que recebe)
 *   - `next/image` com src absoluto   → NÃO recebe (documentado no basePath.md do Next 16)
 * O que NÃO precisa: `next/link` e `next/router`, que prefixam sozinhos.
 */
export const BASE_PATH = "/nero";

/** Monta uma URL interna com o basePath. Use em todo `fetch()` de caminho absoluto. */
export function api(path: string): string {
  return `${BASE_PATH}${path}`;
}
