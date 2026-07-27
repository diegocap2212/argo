/**
 * Testes de lógica pura do Nero Core — sem banco, sem rede, roda no CI.
 * `pnpm --filter nero-portal test:core`
 *
 * POR QUE ESTE ARQUIVO EXISTE: a lista de modelos liberados vive em TRÊS lugares que precisam
 * concordar — a allowlist (`NERO_MODELS`/`resolveModel` em lib/nero/core.ts), a tabela de
 * preços (`PRICES` em lib/nero/pricing.ts) e o seletor do cliente (`MODELS` em
 * components/nero-chat.tsx, que é separado de propósito para não arrastar o SDK da Anthropic
 * para o bundle do browser). Ao trocar Sonnet 4.6 por Sonnet 5 eu esqueci o `FALLBACK` e ele
 * virou `undefined`, o que fazia `costOfTurn` devolver NaN e SILENCIOSAMENTE afrouxar o freio
 * de orçamento. Custo errado não quebra nada visível — só aparece na fatura. Daí o teste.
 *
 * Convenção do repo: script tsx com contagem de falhas (igual scripts/test-performance.ts do
 * Dash e packages/neo-auth/test.ts), sem framework de teste novo.
 */
import { readFileSync } from "node:fs";
import { NERO_MODELS, resolveModel, DEFAULT_MODEL } from "../src/lib/nero/core";
import { costOfTurn, monthlyBudgetUsd } from "../src/lib/nero/pricing";

let pass = 0;
let fail = 0;

function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const TURN = { inputTokens: 1000, outputTokens: 1000, cacheReadTokens: 0, cacheWriteTokens: 0 };

console.log("\n▶ Allowlist × tabela de preços (as três listas concordam?)");
{
  for (const [apelido, id] of Object.entries(NERO_MODELS)) {
    const custo = costOfTurn(id, TURN);
    check(`${apelido} (${id}) tem preço > 0`, custo > 0, `custo=${custo}`);
    check(`${apelido} não devolve NaN`, Number.isFinite(custo), `custo=${custo}`);
    check(`${apelido} sobrevive ao resolveModel`, resolveModel(id) === id, `virou ${resolveModel(id)}`);
  }

  // O FALLBACK protege modelo fora da tabela. Se apontar para chave inexistente, some
  // silenciosamente e todo custo desconhecido vira NaN.
  const custoDesconhecido = costOfTurn("modelo-que-nao-existe", TURN);
  check("modelo fora da tabela usa FALLBACK (não NaN)", Number.isFinite(custoDesconhecido), `custo=${custoDesconhecido}`);
  check("FALLBACK não é zero (não subestima custo)", custoDesconhecido > 0, `custo=${custoDesconhecido}`);

  // O FALLBACK tem de ser >= o mais caro liberado: subestimar custo afrouxaria o freio.
  const maisCaro = Math.max(...Object.values(NERO_MODELS).map((id) => costOfTurn(id, TURN)));
  check("FALLBACK >= modelo liberado mais caro", custoDesconhecido >= maisCaro, `fallback=${custoDesconhecido} maisCaro=${maisCaro}`);

  // O seletor do cliente é uma lista SEPARADA (para não arrastar o SDK pro bundle) — a
  // divergência aqui não dá erro de tipo, então é verificada por leitura do arquivo.
  const chat = readFileSync(new URL("../src/components/nero-chat.tsx", import.meta.url), "utf8");
  for (const id of Object.values(NERO_MODELS)) {
    check(`seletor do cliente oferece ${id}`, chat.includes(`"${id}"`));
  }
  const idsNoSeletor = [...chat.matchAll(/\{ id: "([^"]+)"/g)].map((m) => m[1]);
  for (const id of idsNoSeletor) {
    check(`seletor não oferece modelo fora da allowlist: ${id}`, resolveModel(id) === id, `resolveModel devolveu ${resolveModel(id)}`);
  }
}

console.log("\n▶ resolveModel (guarda da entrada do cliente)");
{
  check("modelo desconhecido cai no padrão", resolveModel("gpt-4") === DEFAULT_MODEL);
  check("undefined cai no padrão", resolveModel(undefined) === DEFAULT_MODEL);
  check("string vazia cai no padrão", resolveModel("") === DEFAULT_MODEL);
  check("padrão está na allowlist", (Object.values(NERO_MODELS) as string[]).includes(DEFAULT_MODEL));
}

console.log("\n▶ costOfTurn (aritmética e cache)");
{
  // Haiku 4.5: $1/1M input, $5/1M output. 1000+1000 tokens = 0.001 + 0.005 = 0.006
  const haiku = costOfTurn(NERO_MODELS.haiku, TURN);
  check("haiku 1k in + 1k out = $0.006", Math.abs(haiku - 0.006) < 1e-9, `deu ${haiku}`);

  // Leitura de cache custa ~0.1x do input; escrita ~1.25x.
  const soLeitura = costOfTurn(NERO_MODELS.haiku, { inputTokens: 0, outputTokens: 0, cacheReadTokens: 1_000_000, cacheWriteTokens: 0 });
  check("1M de cache read no haiku = $0.10", Math.abs(soLeitura - 0.1) < 1e-9, `deu ${soLeitura}`);
  const soEscrita = costOfTurn(NERO_MODELS.haiku, { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 1_000_000 });
  check("1M de cache write no haiku = $1.25", Math.abs(soEscrita - 1.25) < 1e-9, `deu ${soEscrita}`);
  check("cache read é mais barato que input normal", soLeitura < costOfTurn(NERO_MODELS.haiku, { inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }));

  check("turno vazio custa 0", costOfTurn(NERO_MODELS.haiku, { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }) === 0);
  check("output é mais caro que input", costOfTurn(NERO_MODELS.haiku, { ...TURN, outputTokens: 2000 }) > costOfTurn(NERO_MODELS.haiku, { ...TURN, inputTokens: 2000 }));
}

console.log("\n▶ monthlyBudgetUsd (env malformada não pode virar teto infinito)");
{
  const original = process.env.NERO_MONTHLY_BUDGET_USD;
  const casos: Array<[string | undefined, string]> = [
    [undefined, "ausente"],
    ["", "vazia"],
    ["abc", "não-numérica"],
    ["0", "zero"],
    ["-5", "negativa"],
    ["NaN", "NaN literal"],
  ];
  for (const [valor, nome] of casos) {
    if (valor === undefined) delete process.env.NERO_MONTHLY_BUDGET_USD;
    else process.env.NERO_MONTHLY_BUDGET_USD = valor;
    const b = monthlyBudgetUsd();
    check(`env ${nome} → teto padrão finito e > 0`, Number.isFinite(b) && b > 0, `deu ${b}`);
  }
  process.env.NERO_MONTHLY_BUDGET_USD = "50";
  check("env válida é respeitada", monthlyBudgetUsd() === 50, `deu ${monthlyBudgetUsd()}`);
  if (original === undefined) delete process.env.NERO_MONTHLY_BUDGET_USD;
  else process.env.NERO_MONTHLY_BUDGET_USD = original;
}

console.log(`\n${fail === 0 ? "✔" : "✖"} ${pass} passaram, ${fail} falharam\n`);
process.exit(fail === 0 ? 0 : 1);
