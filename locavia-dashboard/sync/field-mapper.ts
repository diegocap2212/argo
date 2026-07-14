import { JiraApiIssue, DashboardItem } from '../src/types/jira';
import { extractStoryPoints } from './story-points';
import { classifyStatus } from './status-classification';
import { normalizeReleaseId } from '../src/lib/normalizeRelease';

// ─────────────────────────────────────────────────────────────────────────────
// RESOLUÇÃO DE TIME — o time do dashboard é o SQUAD, e o sinal confiável é o
// campo Time do Jira (cf11795). Jornada (cf12386) é uma DIMENSÃO de negócio
// atendida por vários times — nunca define o time (isso inflava buckets como
// "SCANIA", que agregava Compras + Estoque). Ver tools/debug/audit-jornada-time.ts.
// ─────────────────────────────────────────────────────────────────────────────

// Time explícito quando não há campo Time confiável.
export const SEM_TIME = 'SEM TIME';

// Projetos dedicados: o time é o próprio projeto, decidido pelo prefixo da key,
// independentemente do campo Time (mantém o comportamento histórico do SFMKT/SFV).
const DEDICATED_PROJECT_PREFIX: Record<string, string> = {
  SFMKT: 'SFMKT',
  SFV: 'SFV',
};

// Tabela EXPLÍCITA e exaustiva dos valores observados no campo Time (cf11795).
// Chave normalizada (uppercase, espaços colapsados). Sem substring/chute.
// "TBD" é deliberadamente ausente — "a definir" cai em SEM TIME.
const TIME_FIELD_TO_TEAM: Record<string, string> = {
  'TIGUAN': 'TIGUAN',
  'OPTIMUS': 'OPTIMUS',
  'FUSCA': 'FUSCA',
  'AMAROK': 'AMAROK',
  'GOL': 'GOL',
  'JETTA': 'JETTA',
  'EURO': 'JETTA',
  'INFO': 'JETTA',
  'SANTANA': 'SANTANA',
  'ID. BUZZ': 'SANTANA',
  'SCANIA S 650': 'SCANIA',
  'NIVUS': 'NIVUS',
  'SF VENDAS': 'SFV',
  'BRASILIA': 'PRICING',
  'D.LAKE DOMINIO': 'D.LAKE DOMINIO',
  'DADOS-PROJETOS': 'D.LAKE DOMINIO',
  'ID.4': 'D.LAKE DOMINIO',
  'D.LAKE ESTRUTURANTE': 'DATA LAKE ESTRUTURANTE',
  'UP': 'UP',
  'TERA': 'TERA',
  'PARATI': 'PARATI',
  'TAOS': 'TAOS',
  'SALESFORCE_MKT': 'SFMKT',
  'PLATAFORMA': 'PLATAFORMA',
  'RESSARCIMENTO': 'RESSARCIMENTO',
};

function normalizeTimeKey(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, ' ');
}

/**
 * Time = squad. Ordem: projeto dedicado (prefixo) → campo Time (cf11795) → SEM TIME.
 * Não deriva time de jornada nem de prefixo ambíguo (RM/CTO/MS aparecem em vários
 * times), que era a fonte de má-atribuição.
 */
export function resolveTeam(issue: JiraApiIssue): string {
  const prefix = (issue.key.split('-')[0] || '').toUpperCase();
  if (DEDICATED_PROJECT_PREFIX[prefix]) return DEDICATED_PROJECT_PREFIX[prefix];

  const timeField = issue.fields.customfield_11795 as { value?: string } | undefined;
  const raw = timeField?.value;
  if (raw) {
    const mapped = TIME_FIELD_TO_TEAM[normalizeTimeKey(raw)];
    if (mapped) return mapped;
  }
  return SEM_TIME;
}

export function mapJiraIssueToDashboardItem(issue: JiraApiIssue): DashboardItem {
  const key = issue.key;

  // 1. Time (squad) — regra única e confiável.
  const finalTeam = resolveTeam(issue);

  // Jornada(s) de negócio — dimensão à parte (cf12386), preservada no item.
  const jornada = (issue.fields.customfield_12386 || []) as string[];

  // 2. Release Cleaning (Priority: O4R Pattern)
  const releaseFieldValues = (issue.fields.customfield_11330 || []) as string[];
  const fixVersions = (issue.fields.fixVersions || []).map((v: any) => v.name);
  const allReleasesRaw = [...releaseFieldValues, ...fixVersions];

  let finalRelease = 'OUTROS';

  // 1. Tentar encontrar padrão O4R (O4R1, O4R2, etc)
  const mainRelease = allReleasesRaw.find(p => p.toUpperCase().startsWith('O4R'));
  if (mainRelease) {
    finalRelease = mainRelease.toUpperCase().replace(/[^A-Z0-9]/g, '');
  } else {
    // 2. Mapeamento Inteligente para O4R (O4R1, O4R2)
    const isO4R2 = allReleasesRaw.some(p => {
        const up = p.toUpperCase();
        return (up.includes('W4') && up.includes('R2')) ||
               (up.includes('WAVE 4') && up.includes('RELEASE 2')) ||
               (up.includes('ONDA 4') && up.includes('RELEASE 2'));
    });

    const isO4R1 = allReleasesRaw.some(p => {
        const up = p.toUpperCase();
        return (up.includes('W4') && up.includes('R1')) ||
               (up.includes('WAVE 4') && up.includes('RELEASE 1')) ||
               (up.includes('ONDA 4') && up.includes('RELEASE 1'));
    });

    if (isO4R2 || allReleasesRaw.some(p => p === '2024.1')) {
        finalRelease = 'O4R2';
    } else if (isO4R1) {
        finalRelease = 'O4R1';
    } else {
        // Backups comuns na planilha (CEM-R1/CEM-R2 agrupados como CEM-R1 e CEM-R2 para paridade)
        const backups = ['BAF', 'BAF-QW', 'CEM-R1', 'CEM-R2', 'CEM', 'WHATSAPP', 'MOB', 'ESTOQUE', 'CONTRATOS', 'COMPRAS'];
        const backup = allReleasesRaw.find(p => backups.includes(p.toUpperCase()));
        if (backup) finalRelease = backup.toUpperCase();
        else if (allReleasesRaw.length > 0) finalRelease = allReleasesRaw[0];
    }
  }

  // Passe final pela normalização canônica (mesma regra do runtime) — dado já sai consistente.
  finalRelease = normalizeReleaseId(finalRelease);

  // 3. Status Categorization (regra única em status-classification.ts).
  // DONE sse a issue tem resolução (resolutiondate) OU o statusCategory do Jira é "concluído".
  // Status de QA/deploy/homolog são "Em andamento" no Jira (sem resolução) -> NÃO são DONE:
  // contá-los como entrega jogava a data de conclusão para a semana errada.
  // Status fica UPPERCASE (contrato com o front: ex. item.Status === 'CANCELADO'/'DESCARTADO').
  const statusName = (issue.fields.status?.name || '').toUpperCase();
  const categoryName = issue.fields.status?.statusCategory?.name || '';
  const category: DashboardItem['StatusCategory'] = classifyStatus(
    statusName,
    categoryName,
    !!issue.fields.resolutiondate,
  );

  return {
    Type: issue.fields.issuetype?.name || 'Task',
    Key: key,
    Summary: issue.fields.summary || '',
    Status: statusName,
    StatusCategory: category,
    Team: finalTeam,
    Created: issue.fields.created,
    Resolved: issue.fields.resolutiondate || null,
    UpdatedAt: issue.fields.updated || issue.fields.created,
    Release: finalRelease,
    StoryPoints: extractStoryPoints(issue.fields),
    Priority: issue.fields.priority?.name || 'Medium',
    Assignee: issue.fields.assignee?.displayName || null,
    Labels: issue.fields.labels || [],
    CommitmentDate: issue.fields.customfield_10102 || null, // Data de Compromentimento
    StartDate: issue.fields.customfield_10015 || null,      // Start date
    FuraFila: issue.fields.customfield_10165 || [],         // Fura Fila
    NaturezaDemanda: issue.fields.customfield_12683 || [],  // Natureza da Demanda
    Jornada: jornada,                                       // Jornada de negócio (dimensão)
    // Épico pai (via parent) — só quando o pai é do tipo Epic (evita capturar hierarquias não-épico).
    Epic: issue.fields.parent?.fields?.issuetype?.name === 'Epic' ? issue.fields.parent.key : null,
    EpicName: issue.fields.parent?.fields?.issuetype?.name === 'Epic' ? (issue.fields.parent.fields.summary || null) : null,
    EpicStatus: issue.fields.parent?.fields?.issuetype?.name === 'Epic' ? (issue.fields.parent.fields.status?.name || null) : null,
    CycleTime: null,
    TimeInTodo: null,
    LeadTime: null,
    LeadTimeP85: null,
    LeadTimeP15: null,
    TimeInStatus: {},
    IsPlanned: false, // Calculated later
    DataQuality: {
      missingResolutionDate: false,
      missingAssignee: false,
      noStatusTransitions: false,
      noSprint: false,
      staleTodo: false,
      suspiciouslyLongLead: false,
      doneWithoutCycleData: false
    },
    Source: 'api'
  };
}
