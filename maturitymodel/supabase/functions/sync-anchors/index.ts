// ============================================================================
// supabase/functions/sync-anchors/index.ts
// Sincroniza âncoras de dados do JIRA (direto) → anchor_readings.
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

interface Item {
  key: string;
  type: string;
  isSubtask: boolean;
  statusCategory: "TODO" | "IN_PROGRESS" | "DONE";
  created: string | null;
  resolved: string | null;
  updated: string | null;
  labels: string[];
  commitmentDate: string | null; // cf10102 (Data de Comprometimento)
  sprintCount: number;           // nº de sprints em que o item esteve (cf10020)
  sprintInjected: boolean;       // entrou numa sprint depois que ela começou
  everDone: boolean;             // já esteve em status concluído (agora ou no changelog)
  reopened: boolean;             // saiu de concluído e voltou a um status ativo
  leadTimeDays: number | null;
}

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

async function jiraSearch(jql: string): Promise<any[]> {
  const all: any[] = [];
  let nextPageToken: string | undefined;
  for (let guard = 0; guard < 100; guard++) {
    const body: Record<string, unknown> = {
      jql, maxResults: 100, fields: JIRA_FIELDS, fieldsByKeys: false, expand: "changelog",
    };
    if (nextPageToken) body.nextPageToken = nextPageToken;
    const res = await fetch(`${JIRA_BASE}/rest/api/3/search/jql`, {
      method: "POST",
      headers: { Authorization: JIRA_AUTH, Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Jira ${res.status}: ${await res.text()}`);
    const data = await res.json();
    if (data.issues?.length) all.push(...data.issues);
    nextPageToken = data.nextPageToken;
    if (!nextPageToken) break;
  }
  return all;
}

// ── Classificação de status (porta de status-classification.ts) ──────────────
const DISCARD = ["DESCARTADO", "CANCELADO"];
const DONE_CAT = ["CONCLU", "DONE", "COMPLETE", "RESOLV"];
const DONE_NAME = ["CONCLU", "DONE", "PRONTO", "FINALIZ", "ENCERR", "RESOLV", "FECHAD", "ENTREGUE"];
const PROGRESS_CAT = ["ANDAMENTO", "PROGRESS", "EXECU"];

const isDoneName = (s?: string) => !!s && DONE_NAME.some((k) => s.toUpperCase().includes(k));
const isDiscardName = (s?: string) => !!s && DISCARD.some((k) => s.toUpperCase().includes(k));

function classifyStatus(statusName: string, categoryName: string, hasResolution: boolean): Item["statusCategory"] {
  const name = (statusName || "").toUpperCase();
  const cat = (categoryName || "").toUpperCase();
  if (DISCARD.some((s) => name.includes(s))) return "TODO";
  if (hasResolution || DONE_CAT.some((k) => cat.includes(k))) return "DONE";
  if (PROGRESS_CAT.some((k) => cat.includes(k))) return "IN_PROGRESS";
  return "TODO";
}

function normalize(issue: any): Item {
  const f = issue.fields ?? {};
  const created = f.created ?? null;
  const resolved = f.resolutiondate ?? null;
  const leadTimeDays =
    created && resolved ? Math.ceil((new Date(resolved).getTime() - new Date(created).getTime()) / 86_400_000) : null;
  const statusCategory = classifyStatus(f.status?.name ?? "", f.status?.statusCategory?.name ?? "", !!resolved);

  // Sprint (cf10020): array de objetos { name, state, startDate, ... }.
  const sprintObjs: any[] = Array.isArray(f.customfield_10020) ? f.customfield_10020 : [];
  const starts = sprintObjs.map((s) => s?.startDate).filter(Boolean).map((d: string) => new Date(d).getTime());
  const earliestStart = starts.length ? Math.min(...starts) : null;

  // Changelog: reabertura (done→ativo) e injeção na sprint (add após o start).
  let everDone = statusCategory === "DONE";
  let reopened = false;
  let sprintInjected = false;
  for (const h of issue.changelog?.histories ?? []) {
    const ts = new Date(h.created).getTime();
    for (const it of h.items ?? []) {
      if (it.field === "status") {
        if (isDoneName(it.toString)) everDone = true;
        if (isDoneName(it.fromString) && !isDoneName(it.toString) && !isDiscardName(it.toString)) reopened = true;
      }
      if (it.field === "Sprint" || it.fieldId === "customfield_10020") {
        const added = (it.to ?? "").length > (it.from ?? "").length; // ganhou uma sprint
        if (added && earliestStart != null && ts > earliestStart) sprintInjected = true;
      }
    }
  }

  return {
    key: issue.key,
    type: f.issuetype?.name ?? "Task",
    isSubtask: !!f.issuetype?.subtask,
    statusCategory,
    created,
    resolved,
    updated: f.updated ?? created,
    labels: f.labels ?? [],
    commitmentDate: f.customfield_10102 ?? null,
    sprintCount: sprintObjs.length,
    sprintInjected,
    everDone,
    reopened,
    leadTimeDays,
  };
}

// ── JQL por squad ────────────────────────────────────────────────────────────
// Exclui só Epic no JQL; subtarefas são filtradas no cliente (isSubtask), pois
// subTaskIssueTypes() falha em projetos company-managed (ex.: RM).
function squadJql(cfg: { teamFieldValues: string[]; keyPrefixes: string[] }): string {
  const q = (v: string) => `"${v.replace(/"/g, '\\"')}"`;
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

Deno.serve(async (req) => {
  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    let results;
    if (body.team_id) {
      results = [await syncTeam(body.team_id, body.cycle_id ?? null)];
    } else {
      const { data: teams } = await sb.from("teams").select("id, name").eq("status", "active");
      results = [];
      for (const t of teams ?? []) {
        if (SQUAD_JIRA[t.name]) results.push(await syncTeam(t.id, null));
      }
    }
    return new Response(JSON.stringify({ ok: true, results }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
