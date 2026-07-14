// Build composto do Portal NEO: três apps Vite independentes servidos numa única origem.
// hub em /, Performance Dash em /dash/, Maturity Model em /maturity/.
// O `--base` na CLI dispensa tocar nos vite.config de cada app — em dev cada um segue com base `/`.
//
// Sem npm workspaces DE PROPÓSITO: o hoisting aninha o rollup/vite de um dos apps e o npm
// derruba o binário nativo da plataforma do nested (bug npm#4828) no builder Linux da Vercel.
// Cada app instala com o PRÓPRIO package-lock (`npm ci`), o mesmo arranjo dos deploys antigos.
import { execSync } from 'node:child_process';
import { cpSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const onVercel = !!process.env.VERCEL;

function run(command, cwd) {
  console.log(`\n▶ [${path.basename(cwd)}] ${command}`);
  execSync(command, { cwd, stdio: 'inherit' });
}

// 1. Builds individuais (tsc de cada app é o gate de tipos; o dash usa project references).
//    Na Vercel, instala as deps de cada app antes (local: node_modules já existem do dev).
for (const [app, build] of [
  ['neo-hub', 'npx tsc --noEmit && npx vite build'],
  ['locavia-dashboard', 'npx tsc -b && npx vite build --base=/dash/'],
  ['maturitymodel', 'npx vite build --base=/maturity/'],
]) {
  const dir = path.join(root, app);
  if (onVercel) run('npm ci', dir);
  run(build, dir);
}

// 2. Composição: dist/ na raiz = hub, com os apps em subdiretórios.
const dist = path.join(root, 'dist');
if (existsSync(dist)) rmSync(dist, { recursive: true, force: true });
cpSync(path.join(root, 'neo-hub', 'dist'), dist, { recursive: true });
cpSync(path.join(root, 'locavia-dashboard', 'dist'), path.join(dist, 'dash'), { recursive: true });
cpSync(path.join(root, 'maturitymodel', 'dist'), path.join(dist, 'maturity'), { recursive: true });

console.log('\n✔ Portal composto em dist/ (/, /dash, /maturity)');
