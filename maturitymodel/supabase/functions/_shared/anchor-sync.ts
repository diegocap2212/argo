/* eslint-disable @typescript-eslint/no-explicit-any -- código de fronteira: parseia
   respostas JSON dinâmicas da API do Jira; tipar cada campo aqui não agrega. */
// ============================================================================
// supabase/functions/_shared/anchor-sync.ts
// Sincroniza âncoras de dados do JIRA (direto) → anchor_readings.
//
// Este arquivo era a Edge Function `sync-anchors` completa. Hoje é só a LÓGICA: a
// autorização vive nos handlers `sync-anchors-user` e `sync-anchors-cron` (ver o rodapé).
//
// Regra de ouro: o front NUNCA fala com o Jira. Este é o único ponto de contato,
// e as credenciais vivem em secrets da função.
//
// Fonte: Jira Cloud REST v3 (Enhanced Search /rest/api/3/search/jql), Basic auth.
// A identificação de squad é por CAMPO Time (cf11795)/Jornada (cf12386)/label —
// NÃO por project key. A maioria dos squads da LM vive no projeto compartilhado
// RM; só Nivus (VAA), SF Cloud (SFMKT) e SF Vendas (SFV) têm projeto próprio.
// (Confirmado por descoberta no Jira grupolm em 2026-07-12.)
//
// Secrets (supabase secrets set ...):
//   JIRA_BASE_URL     https://grupolm.atlassian.net
//   JIRA_USER_EMAIL   email da conta de serviço do Jira
//   JIRA_API_TOKEN    API token do Jira
//   SB_URL            https://cvkcngrmnfwupstyrpsd.supabase.co
//   SB_SERVICE_ROLE   service_role key (bypassa RLS para gravar anchor_readings)
//
// Invocação:
//   - Sob demanda: POST { team_id, cycle_id? }  (botão "Sincronizar agora")
//   - Cron: sem body → todos os squads ativos mapeados
//
// Fórmulas das âncoras (fundamentadas nos campos reais do Jira, ver DESIGN/ARCH):
//   panel.staleness_days ...... idade do card em andamento (WIP) mais desatualizado
//   board.stale_cards_2d ...... cards IN_PROGRESS sem update há > 2 dias
//   board.done_without_resolution_pct . % DONE sem resolutiondate (higiene)
//   flow.cycle_time_variation_pct ..... coef. de variação do lead time (concluídos)
//   flow.adherence_pct ........ comprometido (cf10102 na janela) × entregue (DONE+resolvido)
//   sprint.gmud_inside_count .. itens INJETADOS na sprint após o início (via changelog do campo Sprint)
//   quality.return_rate_pct ... % de itens que REABRIRAM (changelog: done → ativo)
//   slicing.multi_sprint_pct .. % de histórias que estiveram em ≥ 2 sprints (array cf10020)
// Janela: WINDOW_DAYS = 90 (mantém a função leve; difere do locavia, histórico completo).
// ============================================================================

import { createClient } from "npm:@supabase/supabase-js@2";
// A normalização de issue vive em módulo PURO (sem Deno/Supabase) para poder ser testada —
// as fórmulas das âncoras nunca tinham teste porque este arquivo lê `Deno.env` na carga.
import { normalize, type Item } from "./jira-normalize.ts";

const WINDOW_DAYS = 90;

// ── Mapa squad (teams.name) → identificação no Jira ──────────────────────────
// teamFieldValues alimentam cf[11795] (Time), cf[12386] (Jornada) e labels.
// keyPrefixes só para squads com PROJETO próprio; vazio = filtra só por Time.
const SQUAD_JIRA: Record<string, { teamFieldValues: string[]; keyPrefixes: string[] }> = {
  "SF Cloud": { teamFieldValues: ["SFMKT"], keyPrefixes: ["SFMKT"] },
  "SF Vendas": { teamFieldValues: ["SFV", "SALESFORCE VENDAS"], keyPrefixes: ["SFV"] },
  "Nivus": { teamFieldValues: ["NIVUS"], keyPrefixes: ["VAA"] },
  "Gol": { teamFieldValues: ["GOL"], keyPrefixes: [] },
  "Optimus": { teamFieldValues: ["OPTIMUS"], keyPrefixes: [] },
  "Jetta": { teamFieldValues: ["JETTA"], keyPrefixes: [] },
  "Scania": { teamFieldValues: ["SCANIA", "SCANIA S 650"], keyPrefixes: [] },
  "Parati": { teamFieldValues: ["PARATI"], keyPrefixes: [] },
};

type Anchor = {
  id: string;
  dimension_id: string;
  metric_key: string;
  comparator: "<=" | ">=" | "between";
  stage_targets: Record<string, number>;
};

type Verdict = "sustains" | "conflicts" | "limit" | "na";

const sb = createClient(Deno.env.get("SB_URL")!, Deno.env.get("SB_SERVICE_ROLE")!);

// ── Jira client ─────────────────────────────────────────────────────────────
const JIRA_BASE = (Deno.env.get("JIRA_BASE_URL") ?? "").replace(/\/$/, "");
const JIRA_AUTH = "Basic " + btoa(`${Deno.env.get("JIRA_USER_EMAIL")}:${Deno.env.get("JIRA_API_TOKEN")}`);

const JIRA_FIELDS = [
  "summary", "status", "issuetype", "created", "updated", "resolutiondate", "labels",
  "customfield_11795", "customfield_12386", "customfield_10001", // Time / Jornada / Team
  "customfield_10102", // Data de Comprometimento
  "customfield_10020", // Sprint (array)
];

const MAX_PAGES = 100;
const MAX_RETRIES = 4;
const REQUEST_TIMEOUT_MS = 20_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * POST no Jira com timeout, retry e backoff.
 *
 * Antes era um `fetch` nu: sem timeout (uma requisição pendurada consumia todo o tempo da
 * Edge Function e o sync morria sem resultado), sem retry (um único 429 do Jira derrubava o
 * squad inteiro) e devolvendo o body cru do erro na exceção, que subia até a resposta HTTP.
 * O `jira-client.ts` do Dashboard já fazia isso certo — esta função estava atrás dele.
 */
async function jiraPost(path: string, body: unknown): Promise<any> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(`${JIRA_BASE}${path}`, {
        method: "POST",
        headers: { Authorization: JIRA_AUTH, Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      // 429 / 5xx → transitório. Respeita Retry-After quando vem; senão backoff exponencial.
      if (res.status === 429 || res.status >= 500) {
        if (attempt < MAX_RETRIES) {
          const retryAfter = Number(res.headers.get("retry-after")) || 0;
          const backoff = retryAfter > 0 ? retryAfter * 1000 : Math.min(1000 * 2 ** attempt, 16_000);
          console.warn(`[anchor-sync] Jira ${res.status} — retry em ${backoff}ms (${attempt + 1}/${MAX_RETRIES})`);
          await sleep(backoff);
          continue;
        }
      }
      if (!res.ok) {
        // O corpo do erro do Jira vai para o LOG, não para a exceção: ele sobe até a resposta
        // HTTP e pode conter JQL, nome de campo e detalhe da instância.
        console.error(`[anchor-sync] Jira ${res.status} em ${path}:`, (await res.text()).slice(0, 500));
        throw new Error(`Jira respondeu ${res.status}`);
      }
      return await res.json();
    } catch (e) {
      lastErr = e;
      const isHttp = e instanceof Error && e.message.startsWith("Jira respondeu");
      if (isHttp || attempt >= MAX_RETRIES) throw e;
      const backoff = Math.min(1000 * 2 ** attempt, 16_000);
      console.warn(`[anchor-sync] falha de rede no Jira — retry em ${backoff}ms (${attempt + 1}/${MAX_RETRIES})`);
      await sleep(backoff);
    }
  }
  throw lastErr;
}

async function jiraSearch(jql: string): Promise<any[]> {
  const all: any[] = [];
  let nextPageToken: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const body: Record<string, unknown> = {
      jql, maxResults: 100, fields: JIRA_FIELDS, fieldsByKeys: false, expand: "changelog",
    };
    if (nextPageToken) body.nextPageToken = nextPageToken;
    const data = await jiraPost("/rest/api/3/search/jql", body);
    if (data.issues?.length) all.push(...data.issues);
    nextPageToken = data.nextPageToken;
    if (!nextPageToken) return all;
  }
  // Estouro do teto de páginas: FALHA em vez de devolver dado parcial.
  // Antes o `for` terminava e o `return all` entregava um recorte silencioso — as âncoras
  // seriam calculadas sobre parte dos itens e gravadas como se fossem a medição completa.
  // Métrica errada com cara de certa é pior que sync que falhou.
  throw new Error(
    `Paginação do Jira excedeu ${MAX_PAGES} páginas (${all.length} itens) — recorte o JQL ou aumente o teto. ` +
      `Nada foi gravado: melhor sem leitura do que com leitura parcial.`,
  );
}

// ── JQL por squad ────────────────────────────────────────────────────────────
// Exclui só Epic no JQL; subtarefas são filtradas no cliente (isSubtask), pois
// subTaskIssueTypes() falha em projetos company-managed (ex.: RM).
function squadJql(cfg: { teamFieldValues: string[]; keyPrefixes: string[] }): string {
  // Escapa a BARRA INVERTIDA primeiro e só depois a aspa — inverter a ordem faz o segundo
  // replace duplicar as escapas que o primeiro acabou de criar.
  //
  // Antes era só `.replace(/"/g, '\\"')`, que não escapava barra. Um valor terminando em `\`
  // virava `"foo\"`: a barra escapa a aspa de fechamento, o literal não fecha, e o resto do
  // valor é lido como JQL. Hoje os valores vêm do mapa SQUAD_JIRA hardcoded neste arquivo, o
  // que torna isso inofensivo NA CONFIGURAÇÃO ATUAL — e é exatamente por isso que vale
  // corrigir agora: no dia em que o mapa vier de `teams` (que SM edita), passa a ser injeção
  // de JQL, e ninguém vai reler esta linha. Achado do CodeQL (js/incomplete-sanitization).
  const q = (v: string) => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  const tfv = cfg.teamFieldValues.map(q).join(",");
  const clauses = [`labels in (${tfv})`, `cf[11795] in (${tfv})`, `cf[12386] in (${tfv})`];
  if (cfg.keyPrefixes.length) clauses.unshift(`project in (${cfg.keyPrefixes.map(q).join(",")})`);
  return `(${clauses.join(" or ")}) and type != Epic and updated >= -${WINDOW_DAYS}d ORDER BY updated DESC`;
}

// ── Helpers ───────────────────────────────────────────────────────────────
function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  return (Date.now() - new Date(iso).getTime()) / 86_400_000;
}
function coefVarPct(values: number[]): number | null {
  if (values.length < 2) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean === 0) return null;
  const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length;
  return (Math.sqrt(variance) / mean) * 100;
}
const isStory = (i: Item) => /hist[oó]ria|story/i.test(i.type);

// ── Extractors: metric_key → valor calculado sobre os itens do squad ─────────
// (recebem os itens JÁ sem subtarefas)
const EXTRACTORS: Record<string, (items: Item[]) => number | null> = {
  // Idade (dias) do card em andamento mais desatualizado — defasagem do board.
  "panel.staleness_days": (items) => {
    const wip = items.filter((i) => i.statusCategory === "IN_PROGRESS").map((i) => daysSince(i.updated) ?? 0);
    return wip.length ? Math.max(...wip) : 0;
  },
  // Cards em andamento sem atualização há > 2 dias.
  "board.stale_cards_2d": (items) =>
    items.filter((i) => i.statusCategory === "IN_PROGRESS" && (daysSince(i.updated) ?? 0) > 2).length,
  // % de itens DONE sem data de resolução (higiene do board).
  "board.done_without_resolution_pct": (items) => {
    const done = items.filter((i) => i.statusCategory === "DONE");
    if (!done.length) return null;
    return (done.filter((i) => !i.resolved).length / done.length) * 100;
  },
  // Coef. de variação do lead time dos concluídos (previsibilidade de fluxo).
  "flow.cycle_time_variation_pct": (items) =>
    coefVarPct(items.filter((i) => i.statusCategory === "DONE" && i.leadTimeDays != null).map((i) => i.leadTimeDays!)),
  // Aderência: dos comprometidos (têm Data de Comprometimento), % que foi entregue (DONE + resolvido).
  "flow.adherence_pct": (items) => {
    const committed = items.filter((i) => i.commitmentDate != null);
    if (!committed.length) return null;
    return (committed.filter((i) => i.statusCategory === "DONE" && i.resolved).length / committed.length) * 100;
  },
  // Itens injetados numa sprint APÓS o início dela (escopo não planejado invadindo a sprint).
  "sprint.gmud_inside_count": (items) => items.filter((i) => i.sprintInjected).length,
  // Taxa de retorno: % dos itens que já estiveram concluídos e REABRIRAM (done → ativo).
  "quality.return_rate_pct": (items) => {
    const everDone = items.filter((i) => i.everDone);
    if (!everDone.length) return null;
    return (everDone.filter((i) => i.reopened).length / everDone.length) * 100;
  },
  // % de histórias (com sprint) que estiveram em ≥ 2 sprints — fatiamento.
  "slicing.multi_sprint_pct": (items) => {
    const stories = items.filter((i) => isStory(i) && i.sprintCount >= 1);
    if (!stories.length) return null;
    return (stories.filter((i) => i.sprintCount >= 2).length / stories.length) * 100;
  },
};

function verdict(value: number | null, a: Anchor, referenceStage: number | null): Verdict {
  if (value === null || referenceStage === null) return "na";
  const target = a.stage_targets[String(Math.floor(referenceStage))];
  if (target === undefined) return "na";
  const ok = a.comparator === "<=" ? value <= target : value >= target;
  if (ok) return "sustains";
  const slack = a.comparator === "<=" ? target * 1.2 : target * 0.8;
  const nearMiss = a.comparator === "<=" ? value <= slack : value >= slack;
  return nearMiss ? "limit" : "conflicts";
}

async function syncTeam(teamId: string, cycleId: string | null) {
  const { data: team, error: te } = await sb.from("teams").select("id, name").eq("id", teamId).single();
  if (te || !team) return { teamId, skipped: "team inexistente" };
  const cfg = SQUAD_JIRA[team.name];
  if (!cfg) return { teamId, name: team.name, skipped: "sem mapa Jira" };

  const { data: anchors } = (await sb.from("anchors").select("*").eq("active", true)) as { data: Anchor[] | null };
  if (!anchors?.length) return { teamId, skipped: "sem âncoras ativas" };

  // estágio de referência por dimensão: proposta do ciclo aberto > última oficial
  const ref: Record<string, number> = {};
  if (cycleId) {
    const { data: props } = await sb.from("proposals").select("dimension_id, stage").eq("cycle_id", cycleId);
    for (const p of props ?? []) ref[p.dimension_id] = Number(p.stage);
  }
  const { data: official } = await sb
    .from("v_cycle_scores")
    .select("dimension_id, official_stage, quarter")
    .eq("team_id", teamId)
    .order("quarter", { ascending: false });
  for (const o of official ?? []) if (!(o.dimension_id in ref)) ref[o.dimension_id] = Number(o.official_stage);

  const issues = await jiraSearch(squadJql(cfg));
  const items = issues.map(normalize).filter((i) => !i.isSubtask);

  const rows = anchors.map((a) => {
    const extractor = EXTRACTORS[a.metric_key];
    const value = extractor ? extractor(items) : null;
    return {
      team_id: teamId,
      anchor_id: a.id,
      cycle_id: cycleId,
      value,
      verdict: verdict(value, a, ref[a.dimension_id] ?? null),
    };
  });

  const { error } = await sb.from("anchor_readings").insert(rows);
  if (error) throw error;
  return { teamId, name: team.name, itens: items.length, inserted: rows.length };
}

// ── Superfície pública do módulo ─────────────────────────────────────────────
// Este arquivo ERA a Edge Function `sync-anchors` inteira, com `Deno.serve` no fim e ZERO
// autorização: aceitava body vazio (e então sincronizava todos os squads), aceitava
// qualquer `team_id`, e gravava com `SB_SERVICE_ROLE`, contornando RLS. O cron versionado
// a chamava com o JWT `anon` — uma chave PÚBLICA (vai no bundle do browser e estava
// hardcoded na migration) virava gatilho de carga no Jira e de escrita privilegiada.
//
// Agora é só a LÓGICA. Quem decide se a chamada pode acontecer são os dois handlers:
//   · sync-anchors-user → valida o JWT do usuário e exige SM do squad, ou AM/admin global.
//   · sync-anchors-cron → exige secret exclusiva em header (Vault), nunca a anon key.
// O `service_role` continua sendo usado para GRAVAR, mas só depois de a autorização passar.

export { SQUAD_JIRA, syncTeam };

/** Sincroniza todos os squads ativos que existem no mapa do Jira (caminho do cron). */
export async function syncAllMappedTeams() {
  const { data: teams, error } = await sb.from("teams").select("id, name").eq("status", "active");
  if (error) throw error;
  const results: Array<Awaited<ReturnType<typeof syncTeam>>> = [];
  const unmapped: string[] = [];
  for (const t of teams ?? []) {
    if (SQUAD_JIRA[t.name]) results.push(await syncTeam(t.id, null));
    else unmapped.push(t.name);
  }
  // Squad ativo fora do mapa era pulado em SILÊNCIO — o painel dele simplesmente não
  // recebia leitura e ninguém era avisado. Agora volta na resposta.
  return { results, unmapped };
}
