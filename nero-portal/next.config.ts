import type { NextConfig } from "next";
import { BASE_PATH } from "./src/lib/base-path";

/**
 * O Nero é a porta 03 do Portal NEO, servido em https://neo-lm.vercel.app/nero — o projeto
 * `neo-lm` faz rewrite de /nero/** para o deployment deste app (vercel.json da raiz do
 * monorepo). Sem o basePath, todo link e asset do Next apontaria para a raiz da origem,
 * que pertence ao hub.
 *
 * BASE_PATH vem de src/lib/base-path.ts para o prefixo existir em UM lugar só — o mesmo
 * módulo exporta o helper `api()` que o cliente usa nos `fetch()`.
 */
const nextConfig: NextConfig = {
  basePath: BASE_PATH,
  // @neo/auth é publicado como FONTE TypeScript (não tem passo de build), então o Next
  // precisa transpilá-lo junto. É o caminho suportado para pacotes de workspace — e é o que
  // permite ao Nero importar o contrato de sessão por nome, coisa que o Edge Middleware e as
  // functions da Vercel não conseguem (ver o cabeçalho de api/session.ts na raiz).
  transpilePackages: ["@neo/auth"],
  // Saída standalone: necessária para a imagem Docker enxuta (self-host no domínio do
  // cliente — cenários (b)/(c) do blueprint enterprise); inofensiva na Vercel.
  output: "standalone",
};

export default nextConfig;
