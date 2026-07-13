// ────────────────────────────────────────────────────────────────────────────
// SFMKT Sprint Metrics — Type Definitions
// ────────────────────────────────────────────────────────────────────────────

export interface SFMKTItem {
  key: string;
  summary: string;
  type: string;            // Story, Bug, Task, Spike, etc.
  status: string;          // Raw status name
  statusCategory: 'TODO' | 'IN_PROGRESS' | 'DONE';
  assignee: string | null;
  created: string;         // ISO 8601
  resolved: string | null; // ISO 8601 — resolutiondate (auto-filled by Jira)
  sprint: string | null;   // Nome da sprint
  sprintId: number | null;
  sprintState: 'active' | 'closed' | 'future' | null;
  storyPoints: number | null;
  priority: string;
  labels: string[];

  // Calculated metrics (may be null if data is missing)
  leadTimeDays: number | null;    // created → resolved
  cycleTimeDays: number | null;   // first "In Progress" → resolved (via changelog)
  timeInTodoDays: number | null;  // created → first "In Progress"

  // Data quality flags
  dq: DataQualityFlags;
}

export interface DataQualityFlags {
  missingResolutionDate: boolean;    // Done but no resolutiondate
  missingAssignee: boolean;          // No assignee at all
  noStatusTransitions: boolean;      // Went Done without any "In Progress" in changelog
  noSprint: boolean;                 // Not associated with any sprint
  staleTodo: boolean;                // In TODO for > 30 days without moving
  suspiciouslyLongLead: boolean;     // Lead time > 60 days (likely forgotten open)
  doneWithoutCycleData: boolean;     // Done but can't compute cycle time
}

export interface SprintMetrics {
  sprintName: string;
  sprintId: number | null;
  startDate: string | null;
  endDate: string | null;
  state: 'active' | 'closed' | 'future';
  throughput: number;             // Issues resolved in this sprint
  throughputByType: Record<string, number>;
  avgLeadTimeDays: number | null;
  medianLeadTimeDays: number | null;
  avgCycleTimeDays: number | null;
  wipAtEnd: number;
  dataQualityScore: number;       // 0-100 — % of issues with complete data
}

export interface AssigneeMetrics {
  assignee: string;
  totalIssues: number;
  resolvedIssues: number;
  wipIssues: number;
  avgLeadTimeDays: number | null;
  avgCycleTimeDays: number | null;
  typeBreakdown: Record<string, number>;
  dataQualityScore: number;
}

export interface DataQualitySummary {
  totalIssues: number;
  // Counts
  doneWithoutResolutionDate: number;
  inProgressWithoutAssignee: number;
  doneWithoutCycleData: number;
  withoutSprint: number;
  staleTodo: number;
  suspiciouslyLongLead: number;
  // Percentages
  pctDoneWithoutResolutionDate: number;
  pctInProgressWithoutAssignee: number;
  pctDoneWithoutCycleData: number;
  pctWithoutSprint: number;
  pctStaleTodo: number;
  pctSuspiciouslyLongLead: number;
  // Overall score (100 = perfect)
  overallScore: number;
}

export interface SFMKTDashboardData {
  items: SFMKTItem[];
  synced_at: string;        // ISO timestamp of last sync
  project: string;          // 'SFMKT'
  total_fetched: number;
}
