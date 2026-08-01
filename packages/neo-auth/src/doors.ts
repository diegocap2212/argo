/**
 * As portas do portal — rota → permissão.
 *
 * MÓDULO SEPARADO DE PROPÓSITO. `index.ts` toca `process.env` (é o contrato de sessão, que roda
 * em Node e no Edge), e o hub é uma app de browser sem `@types/node`: importar o índice inteiro
 * lá fazia o `tsc` do hub exigir os tipos do Node — e a saída fácil, instalar `@types/node` numa
 * app de browser, deixaria `process.env` compilar no cliente sem reclamação. Este arquivo é só
 * dado e uma função pura, então serve aos dois mundos.
 *
 * Importar por `@neo/auth/doors` (subpath export) em app de browser; `@neo/auth` reexporta tudo
 * para quem já roda em Node.
 */

export interface PortalDoor {
  /** Prefixo da rota, como o build composto a serve. Sem barra final. */
  prefix: string;
  /** Permissão que abre esta porta. Tem de existir no catálogo (`tests/perm-catalog.ts`). */
  perm: string;
  /** Nome pelo qual a pessoa conhece a porta — vai na mensagem de acesso negado. */
  label: string;
}

/**
 * O MAPA CANÔNICO rota → permissão. Uma porta nova é uma linha aqui.
 *
 * ⚠️ EXISTE UMA SEGUNDA CÓPIA em `middleware.ts`, porque o Edge Middleware standalone da
 * Vercel não bundleia imports (ver o cabeçalho de lá). As duas são comparadas linha a linha
 * por `packages/neo-auth/test.ts` — divergir aqui é o jeito de a borda passar a proteger uma
 * rota com a permissão errada, que é indistinguível de "protege" até alguém tentar entrar.
 */
export const PORTAL_DOORS: readonly PortalDoor[] = [
  { prefix: '/dash', perm: 'neo.dash.access', label: 'Performance Dash' },
  { prefix: '/maturity', perm: 'neo.mma.access', label: 'Portal MMA' },
  { prefix: '/nero', perm: 'neo.nero.access', label: 'Nero' },
  { prefix: '/admin', perm: 'neo.admin.access', label: 'Administração' },
];

/**
 * Qual porta serve este caminho? `/dash` e `/dash/x` são a porta do Dash; `/dashboard` NÃO é —
 * casar por prefixo cru abriria rotas vizinhas por acidente de nome.
 */
export function doorForPath(pathname: string): PortalDoor | null {
  for (const door of PORTAL_DOORS) {
    if (pathname === door.prefix || pathname.startsWith(`${door.prefix}/`)) return door;
  }
  return null;
}
