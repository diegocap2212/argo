// Build composto do Portal NEO: três apps Vite independentes servidos numa única origem.
// hub em /, Performance Dash em /dash/, Maturity Model em /maturity/.
// O `--base` na CLI dispensa tocar nos vite.config de cada app — em dev cada um segue com base `/`.
//
// O Nero (/nero) NÃO entra aqui: é Next.js com runtime próprio, deployado como projeto
// Vercel separado e servido por rewrite (ver vercel.json e ARCHITECTURE.md).
//
// As deps vêm de UM `pnpm install` na raiz do workspace (ver pnpm-workspace.yaml) — não há
// mais `npm ci` por app. `npx` resolve os binários do node_modules/.bin de cada pacote,
// que o pnpm popula normalmente.
import { execSync } from 'node:child_process';
import { cpSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function run(command, cwd) {
  console.log(`\n▶ [${path.basename(cwd)}] ${command}`);
  execSync(command, { cwd, stdio: 'inherit' });
}

// 1. Builds individuais (tsc de cada app é o gate de tipos; o dash usa project references).
for (const [app, build] of [
  ['neo-hub', 'npx tsc --noEmit && npx vite build'],
  ['locavia-dashboard', 'npx tsc -b && npx vite build --base=/dash/'],
  ['maturitymodel', 'npx vite build --base=/maturity/'],
]) {
  run(build, path.join(root, app));
}

// 2. Composição: dist/ na raiz = hub, com os apps em subdiretórios.
const dist = path.join(root, 'dist');
if (existsSync(dist)) rmSync(dist, { recursive: true, force: true });
cpSync(path.join(root, 'neo-hub', 'dist'), dist, { recursive: true });
cpSync(path.join(root, 'locavia-dashboard', 'dist'), path.join(dist, 'dash'), { recursive: true });
cpSync(path.join(root, 'maturitymodel', 'dist'), path.join(dist, 'maturity'), { recursive: true });

console.log('\n✔ Portal composto em dist/ (/, /dash, /maturity)');
