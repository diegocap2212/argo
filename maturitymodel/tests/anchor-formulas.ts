/**
 * Fórmulas das âncoras: normalização de issue do Jira.
 * `pnpm --filter maturitymodel test:anchors`
 *
 * POR QUE ESTE ARQUIVO NASCEU: as fórmulas das âncoras nunca tiveram teste. A lógica vivia
 * dentro de `_shared/anchor-sync.ts`, que faz `createClient(Deno.env.get(...))` no topo do
 * módulo — qualquer import quebrava na carga. Resultado: a métrica `sprint.gmud_inside_count`
 * ("itens injetados na sprint") inferia a adição comparando o COMPRIMENTO de duas strings, e
 * ninguém percebeu, porque um número errado numa âncora tem exatamente a mesma cara de um
 * número certo.
 *
 * A lógica foi extraída para `_shared/jira-normalize.ts` (puro) só para poder ser verificada.
 */
import assert from "node:assert/strict";
import { normalize } from "../supabase/functions/_shared/jira-normalize.ts";

let checks = 0;
function check(label: string, fn: () => void) {
  fn();
  checks++;
  console.log(`  ✓ ${label}`);
}

const SPRINT_1 = { id: 1, name: "Sprint 1", state: "closed", startDate: "2026-06-01T00:00:00Z" };
const SPRINT_2 = { id: 2, name: "Sprint 2", state: "active", startDate: "2026-06-15T00:00:00Z" };
const SPRINT_10 = { id: 10, name: "Sprint 10", state: "active", startDate: "2026-07-01T00:00:00Z" };
const SPRINT_FUTURA = { id: 99, name: "Sprint futura", state: "future", startDate: null };

/** Issue mínima no formato que a API do Jira devolve. */
function issue(opts: {
  sprints?: unknown[];
  historico?: Array<{ created: string; items: Array<Record<string, unknown>> }>;
  status?: string;
  categoria?: string;
  resolved?: string | null;
}) {
  return {
    key: "RM-1",
    fields: {
      issuetype: { name: "História" },
      status: { name: opts.status ?? "EM ANDAMENTO", statusCategory: { name: opts.categoria ?? "Em andamento" } },
      created: "2026-05-01T00:00:00Z",
      updated: "2026-07-01T00:00:00Z",
      resolutiondate: opts.resolved ?? null,
      labels: [],
      customfield_10020: opts.sprints ?? [],
    },
    changelog: { histories: opts.historico ?? [] },
  };
}

/** Transição do campo Sprint no changelog. `from`/`to` são ids separados por vírgula. */
function transicaoSprint(created: string, from: string, to: string) {
  return { created, items: [{ field: "Sprint", fieldId: "customfield_10020", from, to }] };
}

console.log("\n▶ sprint.gmud_inside_count — injeção na sprint (era por comprimento de string)");
{
  check("entrar numa sprint DEPOIS que ela começou = injetado", () => {
    const item = normalize(
      issue({
        sprints: [SPRINT_2],
        // Sprint 2 começou em 15/06; o item entrou em 20/06.
        historico: [transicaoSprint("2026-06-20T00:00:00Z", "", "2")],
      }),
    );
    assert.equal(item.sprintInjected, true);
  });

  check("entrar ANTES do início da sprint NÃO é injeção", () => {
    const item = normalize(
      issue({
        sprints: [SPRINT_2],
        // Entrou em 10/06; a sprint 2 só começou em 15/06 (planejamento normal).
        historico: [transicaoSprint("2026-06-10T00:00:00Z", "", "2")],
      }),
    );
    assert.equal(item.sprintInjected, false);
  });

  // ── FALSO POSITIVO do algoritmo antigo ──
  check('trocar sprint "5" por "10" NÃO é adição (a string cresce, o conjunto não)', () => {
    const item = normalize(
      issue({
        sprints: [SPRINT_10],
        // `"5"` → `"10"`: 1 caractere → 2. O algoritmo antigo lia isso como "ganhou sprint".
        // Mas 5 saiu e 10 entrou… então 10 É uma adição. O caso puro de falso positivo é
        // quando o ID cresce SEM mudar de sprint — coberto abaixo.
        historico: [transicaoSprint("2026-07-05T00:00:00Z", "5", "10")],
      }),
    );
    // Aqui a sprint 10 realmente foi adicionada e já havia começado: injetado é CORRETO.
    assert.equal(item.sprintInjected, true);
  });

  check("sprint que PERMANECE não conta como adição, mesmo com string maior", () => {
    const item = normalize(
      issue({
        sprints: [SPRINT_1, SPRINT_2],
        // `"2"` → `"2,1"`: cresceu, mas a sprint 2 já estava. A adição é a 1, que começou em
        // 01/06 — e a mudança é de 20/06, então há injeção pela 1.
        historico: [transicaoSprint("2026-06-20T00:00:00Z", "2", "2,1")],
      }),
    );
    assert.equal(item.sprintInjected, true);
  });

  check("REMOVER sprint não é injeção (string encurta e conjunto diminui)", () => {
    const item = normalize(
      issue({
        sprints: [SPRINT_1, SPRINT_2],
        historico: [transicaoSprint("2026-06-20T00:00:00Z", "1,2", "1")],
      }),
    );
    assert.equal(item.sprintInjected, false);
  });

  // ── FALSO NEGATIVO do algoritmo antigo ──
  check('sair de "1,2" para "10" DETECTA a adição (a string encurta)', () => {
    const item = normalize(
      issue({
        sprints: [SPRINT_1, SPRINT_2, SPRINT_10],
        // `"1,2"` (3 chars) → `"10"` (2 chars): encurtou. O algoritmo antigo NÃO via adição
        // nenhuma aqui — mas a sprint 10, que já começou em 01/07, foi adicionada em 05/07.
        historico: [transicaoSprint("2026-07-05T00:00:00Z", "1,2", "10")],
      }),
    );
    assert.equal(item.sprintInjected, true);
  });

  // ── ERRO DE REFERÊNCIA do algoritmo antigo ──
  check("comparação usa o início da sprint ADICIONADA, não a mais antiga do item", () => {
    const item = normalize(
      issue({
        sprints: [SPRINT_1, SPRINT_2],
        // O item entrou na sprint 2 em 10/06, ANTES dela começar (15/06) → não é injeção.
        // O algoritmo antigo comparava com o início da sprint 1 (01/06), já passado, e
        // marcava injeção indevidamente.
        historico: [transicaoSprint("2026-06-10T00:00:00Z", "1", "1,2")],
      }),
    );
    assert.equal(item.sprintInjected, false);
  });

  check("sprint futura (sem startDate) não pode receber injeção", () => {
    const item = normalize(
      issue({
        sprints: [SPRINT_FUTURA],
        historico: [transicaoSprint("2026-07-20T00:00:00Z", "", "99")],
      }),
    );
    assert.equal(item.sprintInjected, false);
  });

  check("item sem histórico de sprint não é injetado", () => {
    assert.equal(normalize(issue({ sprints: [SPRINT_2] })).sprintInjected, false);
  });

  check("sprintCount reflete o array de sprints", () => {
    assert.equal(normalize(issue({ sprints: [SPRINT_1, SPRINT_2] })).sprintCount, 2);
  });
}

console.log("\n▶ quality.return_rate_pct — reabertura (done → ativo)");
{
  const transicaoStatus = (created: string, fromString: string, toString: string) => ({
    created,
    items: [{ field: "status", fromString, toString }],
  });

  check("done → ativo é reabertura", () => {
    const item = normalize(
      issue({ historico: [transicaoStatus("2026-06-20T00:00:00Z", "CONCLUÍDO", "EM ANDAMENTO")] }),
    );
    assert.equal(item.reopened, true);
    assert.equal(item.everDone, true);
  });

  check("done → DESCARTADO não é reabertura (é descarte)", () => {
    const item = normalize(
      issue({ historico: [transicaoStatus("2026-06-20T00:00:00Z", "CONCLUÍDO", "DESCARTADO")] }),
    );
    assert.equal(item.reopened, false);
  });

  check("ativo → done não é reabertura", () => {
    const item = normalize(
      issue({ historico: [transicaoStatus("2026-06-20T00:00:00Z", "EM ANDAMENTO", "CONCLUÍDO")] }),
    );
    assert.equal(item.reopened, false);
    assert.equal(item.everDone, true);
  });
}

console.log("\n▶ Classificação de status e lead time");
{
  check("resolutiondate presente → DONE", () => {
    const item = normalize(issue({ resolved: "2026-06-11T00:00:00Z", categoria: "Em andamento" }));
    assert.equal(item.statusCategory, "DONE");
  });

  check("DESCARTADO nunca é DONE, mesmo com categoria concluída", () => {
    const item = normalize(issue({ status: "DESCARTADO", categoria: "Concluído" }));
    assert.equal(item.statusCategory, "TODO");
  });

  check("lead time = created → resolved em dias", () => {
    // 01/05 → 11/05 = 10 dias.
    const item = normalize(issue({ resolved: "2026-05-11T00:00:00Z" }));
    assert.equal(item.leadTimeDays, 10);
  });

  check("sem resolução, lead time é null (não inventa data)", () => {
    assert.equal(normalize(issue({})).leadTimeDays, null);
  });
}

console.log(`\n✔ ${checks} verificações das fórmulas de âncora\n`);
