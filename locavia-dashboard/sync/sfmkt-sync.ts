import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { JiraClient } from './jira-client.js';
import { extractStoryPoints } from './story-points.js';
import type { SFMKTItem, SFMKTDashboardData, DataQualityFlags } from '../src/types/sfmkt.js';

// ────────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────────

const PROJECT = 'SFMKT';
const DAYS_HISTORY = 120; // 4 months of history

// Status names that represent "In Progress" (cycle time start)
const IN_PROGRESS_STATUSES = [
  'in progress', 'em andamento', 'em desenvolvimento', 'developing',
  'sendo desenvolvido', 'em execução', 'doing', 'em progresso',
];

// Status names that represent "Done" (cycle time end)
const DONE_STATUS_CATEGORIES = ['done'];

const SPRINT_CUSTOM_FIELD = 'customfield_10020'; // standard Jira sprint field

// Issue types to exclude (sub-tasks only — by name, not by function)
const EXCLUDED_TYPES = ['sub-task', 'subtask', 'sub task', 'subtarefa', 'epic', 'épico', 'epico'];

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function daysBetween(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const ms = new Date(b).getTime() - new Date(a).getTime();
  if (isNaN(ms) || ms < 0) return null;
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function extractSprintInfo(sprintField: any): {
  name: string | null; id: number | null; state: 'active' | 'closed' | 'future' | null;
  startDate: string | null; endDate: string | null;
} {
  if (!sprintField || !Array.isArray(sprintField) || sprintField.length === 0) {
    return { name: null, id: null, state: null, startDate: null, endDate: null };
  }
  // Prefer the active or most recent sprint
  const sorted = [...sprintField].sort((a, b) => {
    const order: Record<string, number> = { active: 0, closed: 1, future: 2 };
    return (order[a.state] ?? 99) - (order[b.state] ?? 99);
  });
  const s = sorted[0];
  return {
    name: s.name || null,
    id: s.id || null,
    state: s.state || null,
    startDate: s.startDate || null,
    endDate: s.endDate || null,
  };
}

function computeCycleAndTodo(
  created: string,
  resolved: string | null,
  histories: any[]
): { cycleTimeDays: number | null; timeInTodoDays: number | null; hasInProgress: boolean } {
  // Filter only status changes
  const statusChanges = histories
    .filter(h => h.items?.some((i: any) => i.field === 'status'))
    .sort((a, b) => new Date(a.created).getTime() - new Date(b.created).getTime());

  let firstInProgressDate: string | null = null;
  let resolvedViaStatusDate: string | null = null;

  for (const history of statusChanges) {
    for (const item of history.items) {
      if (item.field !== 'status') continue;
      const toStatus = (item.toString || '').toLowerCase();
      const fromStatus = (item.fromString || '').toLowerCase();

      // Capture first time moving TO in-progress
      if (
        !firstInProgressDate &&
        IN_PROGRESS_STATUSES.some(s => toStatus.includes(s))
      ) {
        firstInProgressDate = history.created;
      }

      // Capture when it moved TO done category
      if (
        !resolvedViaStatusDate &&
        DONE_STATUS_CATEGORIES.some(s => toStatus.includes(s)) &&
        !DONE_STATUS_CATEGORIES.some(s => fromStatus.includes(s))
      ) {
        resolvedViaStatusDate = history.created;
      }
    }
  }

  const endDate = resolvedViaStatusDate || resolved;

  const cycleTimeDays = firstInProgressDate
    ? daysBetween(firstInProgressDate, endDate)
    : null;

  const timeInTodoDays = firstInProgressDate
    ? daysBetween(created, firstInProgressDate)
    : null;

  return {
    cycleTimeDays,
    timeInTodoDays,
    hasInProgress: !!firstInProgressDate,
  };
}

function buildDataQualityFlags(
  item: Omit<SFMKTItem, 'dq'>,
  hasInProgressTransition: boolean
): DataQualityFlags {
  const isDone = item.statusCategory === 'DONE';
  const isInProgress = item.statusCategory === 'IN_PROGRESS';

  return {
    missingResolutionDate: isDone && !item.resolved,
    missingAssignee: !item.assignee,
    noStatusTransitions: isDone && !hasInProgressTransition,
    noSprint: !item.sprint,
    staleTodo:
      item.statusCategory === 'TODO' &&
      !!item.created &&
      daysBetween(item.created, new Date().toISOString())! > 30,
    suspiciouslyLongLead:
      isDone && item.leadTimeDays !== null && item.leadTimeDays > 60,
    doneWithoutCycleData: isDone && item.cycleTimeDays === null,
  };
}

function mapStatusCategory(statusCategoryName: string): 'TODO' | 'IN_PROGRESS' | 'DONE' {
  const n = statusCategoryName.toLowerCase();
  if (n.includes('done') || n.includes('complete') || n.includes('conclu')) return 'DONE';
  if (n.includes('progress') || n.includes('andamento')) return 'IN_PROGRESS';
  return 'TODO';
}

// ────────────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────────────

async function main() {
  const baseUrl = process.env.JIRA_BASE_URL;
  const email = process.env.JIRA_USER_EMAIL;
  const token = process.env.JIRA_API_TOKEN;

  if (!baseUrl || !email || !token) {
    console.error('❌ Faltam variáveis de ambiente: JIRA_BASE_URL, JIRA_USER_EMAIL, JIRA_API_TOKEN');
    process.exit(1);
  }

  const client = new JiraClient(baseUrl, email, token);

  // Simple JQL — no subTaskIssueTypes() function (company-managed projects may not support it)
  // We filter out sub-tasks and epics after the fetch instead
  const jql = `project = ${PROJECT} AND created >= -${DAYS_HISTORY}d ORDER BY created DESC`;
  console.log(`🔍 Buscando issues do ${PROJECT}...`);
  console.log(`   JQL: ${jql}`);

  const rawIssues = await client.searchIssues(jql, ['*all']);
  console.log(`✅ ${rawIssues.length} issues brutas retornadas.`);

  // Filter out sub-tasks and epics by type name (post-fetch)
  const filteredIssues = rawIssues.filter(issue => {
    const typeName = (issue.fields?.issuetype?.name || '').toLowerCase();
    return !EXCLUDED_TYPES.includes(typeName);
  });
  console.log(`   Após filtro de tipo: ${filteredIssues.length} issues (excluídas: ${rawIssues.length - filteredIssues.length} sub-tasks/epics)`);

  if (filteredIssues.length === 0) {
    console.error('❌ Nenhuma issue retornada. Verifique o JQL e as permissões.');
    process.exit(1);
  }

  const items: SFMKTItem[] = filteredIssues.map(issue => {
    const fields = issue.fields as Record<string, any>;
    const histories = issue.changelog?.histories || [];

    const created = fields.created as string;
    const resolved = (fields.resolutiondate as string | null) || null;
    const statusCategory = mapStatusCategory(
      fields.status?.statusCategory?.name || ''
    );

    const sprintInfo = extractSprintInfo(fields[SPRINT_CUSTOM_FIELD]);
    const storyPoints = extractStoryPoints(fields);

    const leadTimeDays = daysBetween(created, resolved);

    const { cycleTimeDays, timeInTodoDays, hasInProgress } = computeCycleAndTodo(
      created,
      resolved,
      histories
    );

    const partial: Omit<SFMKTItem, 'dq'> = {
      key: issue.key,
      summary: fields.summary || '',
      type: fields.issuetype?.name || 'Task',
      status: fields.status?.name || '',
      statusCategory,
      assignee: fields.assignee?.displayName || null,
      created,
      resolved,
      sprint: sprintInfo.name,
      sprintId: sprintInfo.id,
      sprintState: sprintInfo.state,
      storyPoints,
      priority: fields.priority?.name || 'Medium',
      labels: (fields.labels as string[]) || [],
      leadTimeDays,
      cycleTimeDays,
      timeInTodoDays,
    };

    return {
      ...partial,
      dq: buildDataQualityFlags(partial, hasInProgress),
    };
  });

  // Sort: Done first (for quick checks), then by created desc
  items.sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());

  const output: SFMKTDashboardData = {
    items,
    synced_at: new Date().toISOString(),
    project: PROJECT,
    total_fetched: items.length,
  };

  const outputPath = path.resolve(process.cwd(), 'sfmkt_data.json');
  await fs.writeFile(outputPath, JSON.stringify(output, null, 2), 'utf-8');

  // ── Summary report ──────────────────────────────────────────────────────
  const done = items.filter(i => i.statusCategory === 'DONE');
  const inProgress = items.filter(i => i.statusCategory === 'IN_PROGRESS');
  const todo = items.filter(i => i.statusCategory === 'TODO');

  const doneWithLT = done.filter(i => i.leadTimeDays !== null);
  const avgLT = doneWithLT.length
    ? Math.round(doneWithLT.reduce((s, i) => s + i.leadTimeDays!, 0) / doneWithLT.length)
    : null;

  const doneWithCT = done.filter(i => i.cycleTimeDays !== null);
  const avgCT = doneWithCT.length
    ? Math.round(doneWithCT.reduce((s, i) => s + i.cycleTimeDays!, 0) / doneWithCT.length)
    : null;

  console.log('\n📊 RESUMO SFMKT');
  console.log('─'.repeat(40));
  console.log(`   Total de issues: ${items.length}`);
  console.log(`   Done: ${done.length} | In Progress: ${inProgress.length} | Todo: ${todo.length}`);
  console.log(`   Lead Time médio (calculável): ${avgLT ?? 'N/A'} dias`);
  console.log(`   Cycle Time médio (calculável): ${avgCT ?? 'N/A'} dias`);
  console.log('\n⚠️  QUALIDADE DOS DADOS');
  console.log('─'.repeat(40));
  const dqMissingRes = done.filter(i => i.dq.missingResolutionDate).length;
  const dqNoAssignee = items.filter(i => i.dq.missingAssignee).length;
  const dqNoSprint = items.filter(i => i.dq.noSprint).length;
  const dqNoCycle = done.filter(i => i.dq.doneWithoutCycleData).length;
  const dqStale = items.filter(i => i.dq.staleTodo).length;
  console.log(`   Done sem resolutiondate: ${dqMissingRes} (${done.length ? Math.round(dqMissingRes/done.length*100) : 0}%)`);
  console.log(`   Issues sem assignee: ${dqNoAssignee} (${Math.round(dqNoAssignee/items.length*100)}%)`);
  console.log(`   Issues sem sprint: ${dqNoSprint} (${Math.round(dqNoSprint/items.length*100)}%)`);
  console.log(`   Done sem cycle time rastreável: ${dqNoCycle} (${done.length ? Math.round(dqNoCycle/done.length*100) : 0}%)`);
  console.log(`   TODO parado > 30d: ${dqStale}`);
  console.log('\n✨ Dados salvos em sfmkt_data.json');
}

main().catch(err => {
  console.error('ERRO FATAL:', err);
  process.exit(1);
});
