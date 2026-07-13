import { DashboardItem, JiraApiIssue } from '../src/types/jira';
import { DEV_STARTED_STATUS_NAMES } from './status-classification';

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
