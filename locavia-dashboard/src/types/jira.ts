// Tipo bruto vindo da API Jira
export interface JiraApiIssue {
  /** Id NUMÉRICO da issue. A API sempre devolve; o tipo não declarava. É a chave que o
   *  endpoint `/changelog/bulkfetch` usa para identificar cada entrada da resposta. */
  id: string;
  key: string;
  fields: {
    issuetype: { name: string };
    summary: string;
    status: { name: string; statusCategory: { name: string } };
    created: string;        // ISO 8601
    updated: string;        // ISO 8601 — fields.updated. Vira DashboardItem.UpdatedAt.
    resolutiondate: string | null;
    fixVersions: { name: string }[];
    labels: string[];
    priority: { name: string };
    assignee: { displayName: string } | null;
    // Custom fields cujo valor é atribuído DIRETO a um campo tipado do DashboardItem.
    // Antes caíam no index signature `unknown` do fim, e `unknown || 'default'` estreita
    // para `{}` — foi assim que 5 atribuições de tipo errado ficaram invisíveis até `sync/`
    // entrar no typecheck (tsconfig.tools.json, 2026-07-27). Formato confirmado no dataset
    // de produção; os demais custom fields continuam lidos via index signature + helper
    // (readSelectValue / extractStoryPoints), que já fazem a narrowing explícita.
    customfield_10102?: string | null;   // Data de Comprometimento (date-only, ex.: 2026-07-23)
    customfield_10015?: string | null;   // Start date (date-only)
    customfield_10165?: string[] | null; // Fura Fila (multi-valor de strings)
    customfield_12683?: string[] | null; // Natureza da Demanda (ex.: ["SUSTENTAÇÃO"])
    parent?: {
      key: string;
      fields: {
        summary: string;
        status?: { name: string };
        issuetype: { name: string };
      };
    };
    // Demais custom fields (Time, Jornada, Módulo, Produto, Story Points, ...). Fica por
    // ÚLTIMO de propósito: é o catch-all, não o contrato.
    [key: string]: unknown;
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
  /** DONE sem `resolutiondate` no Jira. Item sai das métricas de entrega — é dívida de
   *  higiene do board, não uma entrega com data estimada. */
  missingResolutionDate: boolean;
  missingAssignee: boolean;
  noStatusTransitions: boolean;
  noSprint: boolean;
  staleTodo: boolean;
  suspiciouslyLongLead: boolean;
  /** `Resolved` anterior a `Created` — impossível, logo o Jira está sujo. Antes o
   *  `Math.abs` do cálculo de lead time escondia isto como duração positiva. */
  negativeLeadTime: boolean;
  /** Histórico de transições veio COMPLETO (bulkfetch) ou é o parcial do `expand` da busca.
   *  `TimeInStatus` e `TimeInTodo` são reconstruídos transição por transição: com histórico
   *  parcial saem errados parecendo certos, então a incerteza tem de viajar com o dado. */
  historyComplete: boolean;
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
  UpdatedAt: string;        // ISO 8601 — fields.updated do Jira. NUNCA use como data de entrega:
                            // era o fallback de `Resolved`, removido por inventar a conclusão.
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
  Modulo: string | null;              // Módulo (cf11297) — ex.: "Erro de processo"
  Produto: string | null;             // Produto (cf13338) — ex.: "Motorista por Aplicativo"
  Epic: string | null;                // Key do épico pai (via parent), quando o pai é do tipo Epic
  EpicName: string | null;            // Summary do épico pai
  EpicStatus: string | null;          // Status atual do épico pai
  TimeInTodo: number | null;          // Dias (Created → 1º In Progress)
  LeadTime: number | null;            // Dias (Created → Resolved)
  LeadTimeP85: number | null;         // Percentil 85
  LeadTimeP15: number | null;         // Percentil 15
  TimeInStatus: Record<string, number>; // Horas por status
  IsPlanned: boolean;                 // Se tem Data de Compromentimento
  DataQuality: DataQualityFlags;      // Flags de qualidade
  Source: 'api' | 'excel';
}
