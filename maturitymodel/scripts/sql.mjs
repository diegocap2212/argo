#!/usr/bin/env node
/**
 * Roda SQL num projeto Supabase pela Management API (o mesmo caminho do SQL editor
 * do dashboard). Existe porque o CLI precisa da senha do banco para `db push`/`db dump`,
 * enquanto a Management API aceita só o Personal Access Token.
 *
 * Uso:
 *   SUPABASE_ACCESS_TOKEN=... node scripts/sql.mjs <project-ref> "select 1"
 *   SUPABASE_ACCESS_TOKEN=... node scripts/sql.mjs <project-ref> --file caminho.sql
 *
 * O token vem SÓ de variável de ambiente — nunca de argumento, que ficaria no histórico
 * do shell e na lista de processos.
 *
 * ⚠️ Roda como `postgres`, então IGNORA RLS. Serve para migration e inspeção, não para
 * testar política de acesso — para isso use tests/pg/rls-local.ts (local) ou
 * tests/rls/rls-matrix.ts (contra um branch, com chaves anon/service_role).
 */
import { readFileSync } from "node:fs";

const token = process.env.SUPABASE_ACCESS_TOKEN;
const [ref, ...rest] = process.argv.slice(2);

if (!token || !ref || rest.length === 0) {
  console.error("uso: SUPABASE_ACCESS_TOKEN=... node scripts/sql.mjs <ref> \"<sql>\" | --file <arquivo>");
  process.exit(2);
}

const query = rest[0] === "--file" ? readFileSync(rest[1], "utf8") : rest.join(" ");

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query }),
});

const text = await res.text();
if (!res.ok) {
  // A mensagem de erro do Postgres vem no corpo — é o que interessa para depurar.
  console.error(`HTTP ${res.status}`);
  console.error(text);
  process.exit(1);
}

// Saída em JSON para poder encadear com node -e / jq sem parsear texto tabular.
console.log(text);
