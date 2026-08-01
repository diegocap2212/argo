/**
 * Contrato do CATÁLOGO DE PERMISSÕES — sem banco, roda no CI.
 *
 * O PERIGO QUE ESTE TESTE EXISTE PARA FECHAR: permissão é string. `has_perm('mma.cicle.
 * homologate')` — com o typo — não é erro de sintaxe, não é erro de tipo e não é erro de
 * runtime. É `false`. A tela some, o botão não aparece, a policy nega, e ninguém sabe por quê.
 * É a pior classe de bug de autorização: silenciosa e do lado "seguro", que é o lado onde
 * ninguém procura.
 *
 * O teste liga os DOIS lados:
 *   · toda permissão USADA (em SQL ou TS) existe no catálogo semeado;
 *   · toda permissão do CATÁLOGO é usada em algum lugar (senão é interruptor que não acende).
 *
 * Mesma técnica do `journey-contract.ts`: lê os arquivos como TEXTO e compara. Não precisa de
 * Postgres, então falha em segundos no CI em vez de num teste de RLS de 40s.
 *
 * Uso: pnpm -C maturitymodel test:perms
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const MMA = join(HERE, "..");
const ARGO = join(MMA, "..");
const RBAC_MIGRATION = join(MMA, "supabase", "migrations", "20260731120000_neo_rbac.sql");

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 1. O catálogo e a matriz, lidos do seed da migration
// ════════════════════════════════════════════════════════════════════════════
const rbacSql = readFileSync(RBAC_MIGRATION, "utf8");

/** Recorta o bloco `insert into <tabela> ... values (...) on conflict`. */
function insertBlock(sql: string, tabela: string): string {
  const start = sql.indexOf(`insert into public.${tabela}`);
  if (start === -1) throw new Error(`bloco de insert de ${tabela} não encontrado`);
  const end = sql.indexOf("on conflict", start);
  if (end === -1) throw new Error(`fim do insert de ${tabela} não encontrado`);
  return sql.slice(start, end);
}

// `('neo.dash.access', 'neo', ...` — o id seguido do app é o que distingue uma linha do
// catálogo de uma linha da matriz (que é `('papel', 'permissao')`).
const catalogo = new Set(
  [...insertBlock(rbacSql, "neo_permissions").matchAll(/\(\s*'([a-z][a-z0-9._]*)',\s*'(?:neo|mma|dash|nero)'/g)].map(
    (m) => m[1]!,
  ),
);
const papeis = new Set(
  [...insertBlock(rbacSql, "neo_roles").matchAll(/\(\s*'([a-z_]+)',\s*'[^']+',\s*\n?/g)].map((m) => m[1]!),
);
const matriz = [
  ...insertBlock(rbacSql, "neo_role_permissions").matchAll(/\(\s*'([a-z_]+)',\s*'([a-z][a-z0-9._]*)'\s*\)/g),
].map((m) => ({ papel: m[1]!, perm: m[2]! }));

console.log("\nCatálogo lido do seed:\n");
check("o catálogo de permissões foi encontrado", catalogo.size > 20, `${catalogo.size} permissões`);
check("os papéis foram encontrados", papeis.size === 6, `${papeis.size}: ${[...papeis].join(",")}`);
check("a matriz foi encontrada", matriz.length > 50, `${matriz.length} pares`);

// ════════════════════════════════════════════════════════════════════════════
// 2. A matriz só cita papel e permissão que existem
//
// Uma linha da matriz com id errado é aceita pelo Postgres? Não — há FK. Mas a FK só protege
// em tempo de APLICAÇÃO da migration; este teste falha em segundos e diz QUAL linha está errada,
// em vez de derrubar a migration inteira com uma violação de chave estrangeira.
// ════════════════════════════════════════════════════════════════════════════
console.log("\nIntegridade da matriz semente:\n");
const papelInvalido = matriz.filter((m) => !papeis.has(m.papel));
check(
  "toda linha da matriz cita um papel existente",
  papelInvalido.length === 0,
  papelInvalido.map((m) => `${m.papel}/${m.perm}`).join(", "),
);
const permInvalida = matriz.filter((m) => !catalogo.has(m.perm));
check(
  "toda linha da matriz cita uma permissão existente",
  permInvalida.length === 0,
  permInvalida.map((m) => `${m.papel}/${m.perm}`).join(", "),
);

// O papel implícito não pode receber permissão de squad: `has_perm` resolve papel global
// ignorando o squad, então `('todos','mma.squad.read')` abriria TODOS os squads para a empresa
// inteira. É a pegadinha documentada no cabeçalho da migration — aqui ela é verificada.
const squadPerms = new Set(
  [
    ...insertBlock(rbacSql, "neo_permissions").matchAll(
      /\(\s*'([a-z][a-z0-9._]*)',\s*'(?:neo|mma|dash|nero)'[\s\S]*?'(global|squad)',\s*\d+\s*\)/g,
    ),
  ]
    .filter((m) => m[2] === "squad")
    .map((m) => m[1]!),
);
const todosComSquad = matriz.filter((m) => m.papel === "todos" && squadPerms.has(m.perm));
check(
  "o papel implícito `todos` não recebe permissão de squad",
  todosComSquad.length === 0,
  todosComSquad.map((m) => m.perm).join(", "),
);

// ════════════════════════════════════════════════════════════════════════════
// 3. Toda permissão USADA em SQL existe no catálogo
// ════════════════════════════════════════════════════════════════════════════
console.log("\nUso em SQL (todas as migrations):\n");
const migrationsDir = join(MMA, "supabase", "migrations");
const usosSql = new Map<string, string>(); // permissão → primeiro arquivo que a usa
const prefixosSql = new Map<string, string>();

for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()) {
  const sql = readFileSync(join(migrationsDir, file), "utf8");
  for (const m of sql.matchAll(/has_perm\(\s*'([^']+)'/g)) {
    if (!usosSql.has(m[1]!)) usosSql.set(m[1]!, file);
  }
  for (const m of sql.matchAll(/has_perm_prefix\(\s*'([^']+)'/g)) {
    if (!prefixosSql.has(m[1]!)) prefixosSql.set(m[1]!, file);
  }
}

check("o SQL usa has_perm", usosSql.size > 10, `${usosSql.size} permissões distintas`);

const sqlFantasma = [...usosSql].filter(([p]) => !catalogo.has(p));
check(
  "toda permissão usada em SQL existe no catálogo",
  sqlFantasma.length === 0,
  sqlFantasma.map(([p, f]) => `'${p}' em ${f}`).join("; "),
);

// Um prefixo tem de casar com ALGO. `has_perm_prefix('mma.ciclo.')` — em português por engano —
// nunca casaria, e a policy negaria para todo mundo, calada.
const prefixoFantasma = [...prefixosSql].filter(
  ([pre]) => ![...catalogo].some((p) => p.startsWith(pre)),
);
check(
  "todo prefixo usado em SQL casa com alguma permissão do catálogo",
  prefixoFantasma.length === 0,
  prefixoFantasma.map(([p, f]) => `'${p}' em ${f}`).join("; "),
);

// ════════════════════════════════════════════════════════════════════════════
// 4. Toda permissão USADA em TypeScript existe no catálogo
//
// Varre o monorepo inteiro, não só o MMA: as permissões atravessam os quatro apps, o
// middleware da borda e as functions de api/.
// ════════════════════════════════════════════════════════════════════════════
console.log("\nUso em TypeScript (monorepo):\n");
const IGNORAR = new Set(["node_modules", "dist", ".next", ".git", ".vercel", "test-results", ".pnpm-store"]);
const arquivosTs: string[] = [];
(function varrer(dir: string) {
  for (const entry of readdirSync(dir)) {
    if (IGNORAR.has(entry)) continue;
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) varrer(full);
    else if (/\.(ts|tsx)$/.test(entry)) arquivosTs.push(full);
  }
})(ARGO);

/**
 * Remove comentários antes de varrer. Código comentado e exemplo em docstring NÃO são uso —
 * contá-los faz o guarda cobrar catálogo por permissão que ninguém chama, e (pior) faz uma
 * permissão morta parecer viva no bloco 5. O `[^:]` antes de `//` preserva `https://`.
 */
const semComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/gm, "$1");

/** Arquivo de teste CITA permissão; não a CONSOME. Ver a distinção no bloco 5. */
const ehTeste = (f: string) =>
  /[\\/]tests?[\\/]/.test(f) || /(^|[\\/])[^\\/]*\.?(test|spec)\.tsx?$/.test(f);

const usosTs = new Map<string, string>(); // toda citação — valida contra o catálogo
const consumoTs = new Map<string, string>(); // só código de produção — conta como consumidor

for (const file of arquivosTs) {
  // Este próprio arquivo cita permissões como exemplo em comentário — não conta como uso.
  if (file === fileURLToPath(import.meta.url)) continue;
  const src = semComentarios(readFileSync(file, "utf8"));
  // Varredura por FORMATO, não por chamada. Casar com `hasPerm(...)` amarra o guarda a uma
  // assinatura — e essa amarra já falhou uma vez (ver a meta-guarda abaixo). Permissão do NEO
  // tem forma reconhecível: `app.grupo.acao` com app em {neo,mma,dash,nero}. Qualquer literal
  // dessa forma é validado, esteja ele num `hasPerm`, num mapa de rotas da borda, num prop de
  // React ou num `p_perm:` de RPC. Medido no monorepo: nenhum falso positivo.
  //
  // O limite conhecido: literal montado em runtime (`` `${app}.x.y` `` ou concatenação) escapa.
  // É deliberado — permissão dinâmica não é verificável por texto, e o teste diria menos do que
  // parece se fingisse cobri-la.
  for (const re of [
    /['"]((?:neo|mma|dash|nero)\.[a-z0-9_]+\.[a-z0-9_]+)['"]/g,
    /p_perm:\s*['"]([^'"]+)['"]/g,
  ]) {
    for (const m of src.matchAll(re)) {
      const rel = relative(ARGO, file);
      if (!usosTs.has(m[1]!)) usosTs.set(m[1]!, rel);
      if (!ehTeste(rel) && !consumoTs.has(m[1]!)) consumoTs.set(m[1]!, rel);
    }
  }
}

const tsFantasma = [...usosTs].filter(([p]) => !catalogo.has(p));
check(
  "toda permissão usada em TypeScript existe no catálogo",
  tsFantasma.length === 0,
  tsFantasma.map(([p, f]) => `'${p}' em ${f}`).join("; "),
);

// META-GUARDA. Este teste JÁ FALHOU EM SILÊNCIO: a regex antiga exigia a permissão como
// PRIMEIRO argumento (`hasPerm('x')`), a assinatura real é `hasPerm(payload, 'x')`, e a
// varredura reportou "0 permissões citadas em TS" — verde, e cega. Um guarda que não acha nada
// é indistinguível de um código sem problema, então a ausência total de achados passa a ser
// falha. Se o helper mudar de forma de novo, isto quebra em vez de emudecer.
check(
  "a varredura de TypeScript não está cega",
  usosTs.size > 0,
  `nenhuma permissão encontrada em ${arquivosTs.length} arquivos — a regex provavelmente parou de casar com o formato usado no código`,
);
console.log(
  `     (${usosTs.size} permissões citadas em TS — ${consumoTs.size} em código de produção — em ${arquivosTs.length} arquivos varridos)`,
);

// ════════════════════════════════════════════════════════════════════════════
// 5. O outro lado: permissão do catálogo que NINGUÉM usa
//
// Um interruptor que não acende nada é pior que nenhum interruptor: a pessoa leiga desliga,
// acredita ter tirado um acesso, e o acesso continua.
//
// As permissões de PORTA (`neo.*.access`) são consumidas pelo middleware da borda e pelo hub,
// que ainda não existem nesta etapa — ficam listadas como pendência explícita em vez de
// falharem o teste antes da hora.
//
// ⚠️ TESTE NÃO É CONSUMIDOR. Uma permissão citada só em `tests/` não está ligada a nada: o
// interruptor continua sem lâmpada, e contá-la aqui esconderia exatamente o que este bloco
// procura. A citação ainda é validada contra o catálogo no bloco 4 (typo em teste também é
// typo) — ela só não conta como "alguém usa isto".
// ════════════════════════════════════════════════════════════════════════════
console.log("\nPermissões sem consumidor:\n");
const usadas = new Set([...usosSql.keys(), ...consumoTs.keys()]);
const porPrefixo = (p: string) => [...prefixosSql.keys()].some((pre) => p.startsWith(pre));
// Vazia — e é assim que ela deve permanecer.
//
// As quatro portas (`neo.*.access`) saíram na etapa 4, quando `PORTAL_DOORS` (packages/neo-auth)
// e a cópia em `middleware.ts` passaram a consumi-las; `dash.tower.view` saiu na etapa 6, com o
// `has_perm` no `api/data.ts`. Uma entrada nova aqui é uma permissão semeada ANTES do código que
// a usa — aceitável durante uma rodada, e só com data e etapa escritas ao lado.
const PENDENTES_DE_ETAPA = new Set<string>([]);

const semUso = [...catalogo].filter((p) => !usadas.has(p) && !porPrefixo(p));
const semUsoInesperado = semUso.filter((p) => !PENDENTES_DE_ETAPA.has(p));
check(
  "nenhuma permissão do catálogo ficou sem consumidor",
  semUsoInesperado.length === 0,
  semUsoInesperado.join(", "),
);
const pendentes = semUso.filter((p) => PENDENTES_DE_ETAPA.has(p));
if (pendentes.length) {
  console.log(`     pendentes de etapa (borda/hub/Dash/app de admin): ${pendentes.join(", ")}`);
}
// A lista de exceções tem de encolher. Uma permissão que JÁ tem consumidor e continua listada
// como pendente vira licença permanente para a próxima.
const pendenteObsoleta = [...PENDENTES_DE_ETAPA].filter((p) => usadas.has(p));
check(
  "a lista PENDENTES_DE_ETAPA não tem entrada obsoleta",
  pendenteObsoleta.length === 0,
  `já têm consumidor, remova de PENDENTES_DE_ETAPA: ${pendenteObsoleta.join(", ")}`,
);

console.log(`\n${passed} passaram, ${failed} falharam.\n`);
process.exit(failed === 0 ? 0 : 1);
