import { DashboardItem, JiraApiIssue } from '../src/types/jira';
import { DEV_STARTED_STATUS_NAMES, classifyStage } from './status-classification';

/**
 * Reconstrói, a partir do changelog, quanto tempo (em HORAS) a issue passou em cada ETAPA
 * do fluxo (Backlog/Desenvolvimento/QA/Homologação-Deploy/Concluído). Base do "cycle time por
 * etapa". Percorre as transições de status em ordem: cada status vale de quando foi assumido
 * até a próxima transição; o último vigente vale até Resolved (ou agora, se ainda aberto).
 * Status não reconhecidos por classifyStage são ignorados (não distorcem o total).
 */
function computeTimeInStage(rawIssue: JiraApiIssue, item: DashboardItem, now: Date): Record<string, number> {
  const hours: Record<string, number> = {};
  const createdDate = item.Created ? new Date(item.Created) : null;
  if (!createdDate || Number.isNaN(createdDate.getTime())) return hours;

  // Transições de status achatadas e ordenadas cronologicamente.
  const changes: { from: string; to: string; at: Date }[] = [];
  for (const history of rawIssue.changelog?.histories ?? []) {
    for (const hi of history.items) {
      if (hi.field === 'status') {
        changes.push({ from: hi.fromString || '', to: hi.toString || '', at: new Date(history.created) });
      }
    }
  }
  changes.sort((a, b) => a.at.getTime() - b.at.getTime());

  const add = (statusName: string, fromT: Date, toT: Date) => {
    const stage = classifyStage(statusName);
    if (!stage) return;
    const ms = toT.getTime() - fromT.getTime();
    if (ms > 0) hours[stage] = (hours[stage] ?? 0) + ms / 3_600_000;
  };

  // Sem transições: a issue ficou no status atual desde a criação.
  let currentStatus = changes.length ? changes[0].from : item.Status;
  let since = createdDate;
  for (const change of changes) {
    add(currentStatus, since, change.at);
    currentStatus = change.to;
    since = change.at;
  }
  const end = item.Resolved ? new Date(item.Resolved) : now;
  add(currentStatus, since, end);

  // Arredonda para 1 casa (horas) para não inflar o dataset com floats longos.
  for (const k of Object.keys(hours)) hours[k] = Math.round(hours[k] * 10) / 10;
  return hours;
}

export function calculateMetrics(item: DashboardItem, rawIssue: JiraApiIssue): DashboardItem {
  // 1. Calculate IsPlanned
  item.IsPlanned = !!item.CommitmentDate;

  // 2. Time In Todo a partir do changelog.
  // IMPORTANTE: a data de conclusão (item.Resolved) NÃO vem daqui — ela é o `resolutiondate`
  // definido no field-mapper, que é exatamente o `resolved` que o time usa no JQL
  // (`resolved >= startOfWeek()`). Derivar a conclusão da primeira transição para um status
  // "done" jogava a entrega para a semana em que a issue entrou em QA/deploy, e não na conclusão.
  if (rawIssue.changelog && rawIssue.changelog.histories) {
    let firstInProgressDate: Date | null = null;

    // Sort histories chronological
    const histories = rawIssue.changelog.histories.sort((a, b) =>
      new Date(a.created).getTime() - new Date(b.created).getTime()
    );

    for (const history of histories) {
      for (const historyItem of history.items) {
        if (historyItem.field === 'status') {
          const toString = (historyItem.toString || '').toLowerCase();
          if (!firstInProgressDate && DEV_STARTED_STATUS_NAMES.some(s => toString.includes(s))) {
            firstInProgressDate = new Date(history.created);
          }
        }
      }
    }

    if (firstInProgressDate && item.Created) {
       const createdDate = new Date(item.Created);
       if (firstInProgressDate > createdDate) {
           item.TimeInTodo = Math.ceil((firstInProgressDate.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24));
       } else {
           item.TimeInTodo = 0;
       }
    }
  }

  // Fallback: item concluído sem resolutiondate (raro; outros projetos sem resolução no workflow).
  if (item.StatusCategory === 'DONE' && !item.Resolved) {
    item.Resolved = item.UpdatedAt;
  }

  // Tempo por etapa (cycle time por etapa) — depende do Resolved já resolvido acima.
  item.TimeInStatus = computeTimeInStage(rawIssue, item, new Date());

  // 3. Raw LeadTime (Created to Resolved)
  if (item.Created && item.Resolved) {
    const createdDate = new Date(item.Created);
    const resolvedDate = new Date(item.Resolved);
    const diffTime = Math.abs(resolvedDate.getTime() - createdDate.getTime());
    item.LeadTime = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  } else if (item.StatusCategory === 'DONE' && item.Created && item.UpdatedAt) {
    const createdDate = new Date(item.Created);
    const resolvedDate = new Date(item.UpdatedAt);
    const diffTime = Math.abs(resolvedDate.getTime() - createdDate.getTime());
    item.LeadTime = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }
  
  // 4. Data Quality Flags
  const untouchedDays = Math.ceil((new Date().getTime() - new Date(item.UpdatedAt).getTime()) / (1000 * 60 * 60 * 24));
  
  item.DataQuality = {
    missingResolutionDate: item.StatusCategory === 'DONE' && !item.Resolved,
    missingAssignee: !item.Assignee,
    noStatusTransitions: (!rawIssue.changelog || !rawIssue.changelog.histories || rawIssue.changelog.histories.length === 0) && item.StatusCategory !== 'TODO',
    noSprint: false,
    staleTodo: item.StatusCategory === 'TODO' && untouchedDays > 30,
    suspiciouslyLongLead: (item.LeadTime || 0) > 180
  };
  
  return item;
}
