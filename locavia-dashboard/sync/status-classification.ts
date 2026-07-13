// Fonte ÚNICA de classificação de status do Jira para o sync.
// field-mapper.ts e metrics-calculator.ts importam daqui — não duplicar listas
// (mesma motivação dos invariantes de story-points: evitar divergência entre arquivos).
//
// Verdade do Jira da LM (validado via REST): o próprio `statusCategory` já distingue
// concluído × em andamento × pendente, e ele bate 100% com a presença de `resolution`:
//   - "Itens concluídos"  (Done)        -> sempre tem resolution  -> DONE
//   - "Em andamento"      (In Progress) -> nunca tem resolution    -> IN_PROGRESS
//   - "Itens Pendentes"   (To Do)       -> nunca tem resolution    -> TODO
// Por isso NÃO classificamos "done" por nome de status: status de QA/deploy/homolog
// (ex.: AGUARDANDO QA, QA EM PROGRESSO, AGUARDANDO DEPLOY PROD) são "Em andamento" no
// Jira e NÃO são entrega. Tratá-los como DONE jogava a entrega para a semana errada.

export type StatusCategory = 'TODO' | 'IN_PROGRESS' | 'DONE';

// Palavras-chave do statusCategory do Jira (pt-BR e en) — fonte primária da classificação.
const DONE_CATEGORY_KEYWORDS = ['CONCLU', 'DONE', 'COMPLETE', 'RESOLV'];
const PROGRESS_CATEGORY_KEYWORDS = ['ANDAMENTO', 'PROGRESS', 'EXECU'];

// Cancelados/descartados são fechados (têm resolução, statusCategory "concluído" no Jira),
// mas NÃO contam como entrega. Nunca devem virar DONE — senão entrariam no throughput/vazão.
// O front já trata "descartados" como bucket próprio (por nome de status), então mantê-los
// fora de DONE basta para excluí-los da entrega.
const DISCARD_STATUS_NAMES = ['DESCARTADO', 'CANCELADO'];

// Nomes de status que indicam que o DESENVOLVIMENTO começou — usado apenas para
// detectar `firstInProgressDate`/TimeInTodo no changelog (lá só há o nome do status,
// não o statusCategory).
export const DEV_STARTED_STATUS_NAMES = [
  'in progress', 'em andamento', 'em desenvolvimento', 'developing',
  'em execução', 'doing', 'em progresso', 'em refinamento',
  'code review em progresso', 'aguardando code review',
];

/**
 * Classifica o estado atual de uma issue.
 * Regra: DONE sse tem resolução (resolutiondate) OU o statusCategory do Jira é "concluído";
 * caso contrário usa o statusCategory para IN_PROGRESS/TODO.
 */
export function classifyStatus(
  statusName: string,
  jiraCategoryName: string,
  hasResolution: boolean,
): StatusCategory {
  const name = (statusName || '').toUpperCase();
  const cat = (jiraCategoryName || '').toUpperCase();

  // Descartado/Cancelado: fechado, mas fora da entrega — nunca DONE.
  if (DISCARD_STATUS_NAMES.some(s => name.includes(s))) {
    return 'TODO';
  }

  if (hasResolution || DONE_CATEGORY_KEYWORDS.some(k => cat.includes(k))) {
    return 'DONE';
  }
  if (PROGRESS_CATEGORY_KEYWORDS.some(k => cat.includes(k))) {
    return 'IN_PROGRESS';
  }
  // Fallback por nome de status, caso o statusCategory venha vazio/desconhecido.
  if (DEV_STARTED_STATUS_NAMES.some(s => (statusName || '').toLowerCase().includes(s))) {
    return 'IN_PROGRESS';
  }
  return 'TODO';
}
