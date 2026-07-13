// Tipo bruto vindo da API Jira
export interface JiraApiIssue {
  key: string;
  fields: {
    issuetype: { name: string };
    summary: string;
    status: { name: string; statusCategory: { name: string } };
    created: string;        // ISO 8601
    resolutiondate: string | null;
    fixVersions: { name: string }[];
    [key: string]: unknown; // Allow custom fields
    labels: string[];
    priority: { name: string };
    assignee: { displayName: string } | null;
  };
  changelog?: {
    histories: StatusTransition[];
  };
}

// Transição de status (para métricas avançadas)
export interface StatusTransition {
  created: string; // ISO timestamp
  items: {
    field: string;
    fromString: string;
    toString: string;
  }[];
}

export interface DataQualityFlags {
  missingResolutionDate: boolean;
  missingAssignee: boolean;
  noStatusTransitions: boolean;
  noSprint: boolean;
  staleTodo: boolean;
  suspiciouslyLongLead: boolean;
}

// Formato normalizado para o dashboard (evolução do formato atual)
export interface DashboardItem {
  Type: string;
  Key: string;
  Summary: string;
  Status: string;
  StatusCategory: 'TODO' | 'IN_PROGRESS' | 'DONE';
  Team: string;
  Created: string;          // ISO 8601
  Resolved: string | null;  // ISO 8601 — resolutiondate do Jira (só preenchido no fechamento final)
  UpdatedAt: string;        // ISO 8601 — fields.updated do Jira; fallback de data para itens DONE sem Resolved
  Release: string;
  StoryPoints: number | null;
  Priority: string;
  Assignee: string | null;
  Labels: string[];
  CommitmentDate: string | null;      // Data de Compromentimento
  StartDate: string | null;           // Start date
  FuraFila: string[];                 // Labels fura-fila
  NaturezaDemanda: string[];          // Natureza da Demanda
  Jornada: string[];                  // Jornada(s) de negócio (cf12386) — dimensão, NÃO define o Team
  TimeInTodo: number | null;          // Dias (Created → 1º In Progress)
  LeadTime: number | null;            // Dias (Created → Resolved)
  LeadTimeP85: number | null;         // Percentil 85
  LeadTimeP15: number | null;         // Percentil 15
  TimeInStatus: Record<string, number>; // Horas por status
  IsPlanned: boolean;                 // Se tem Data de Compromentimento
  DataQuality: DataQualityFlags;      // Flags de qualidade
  Source: 'api' | 'excel';
}
