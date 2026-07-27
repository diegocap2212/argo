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

// ─────────────────────────────────────────────────────────────────────────────
// ETAPAS DO FLUXO (dimensão nova e paralela ao StatusCategory) — usada só para o
// "cycle time por etapa" (tempo em cada fase do changelog). NÃO altera a classificação
// TODO/IN_PROGRESS/DONE, que continua sendo a fonte única de entrega.
export type Stage = 'Backlog' | 'Desenvolvimento' | 'QA' | 'Homologação/Deploy' | 'Concluído';

// Ordem canônica do fluxo (para montar o waterfall na ordem certa).
export const STAGE_ORDER: readonly Stage[] = [
  'Backlog', 'Desenvolvimento', 'QA', 'Homologação/Deploy', 'Concluído',
];

// Range dos acentos combinantes (U+0300–U+036F). Via RegExp por string p/ não depender de
// caracteres combinantes literais no arquivo-fonte.
const COMBINING_MARKS = new RegExp('[\\u0300-\\u036f]', 'g');

/** Remove acentos, emojis e prefixos de numeração ("1. ", "6. ") do nome do status. */
function normalizeStatusName(statusName: string): string {
  return (statusName || '')
    .normalize('NFD')                    // decompõe acentos (Ç → C + cedilha combinante)
    .replace(COMBINING_MARKS, '')        // remove os acentos → junto (CONCLUÍDO → CONCLUIDO)
    // Fora do ASCII IMPRIMÍVEL → espaço. Era `[^\x00-\x7F]`, que preservava caracteres de
    // controle (0x00–0x1F) dentro do nome do status; o `\x00` também disparava
    // `no-control-regex` quando `sync/` entrou no lint. A faixa 0x20–0x7F cobre emoji e
    // símbolo do mesmo jeito e agora limpa controle junto (o `\s+ → ' '` abaixo colapsa).
    .replace(/[^\x20-\x7F]/g, ' ')
    .replace(/^\s*\d+\.\s*/, '')         // "1. BACKLOG" → "BACKLOG"
    .toUpperCase().replace(/\s+/g, ' ').trim();
}

/**
 * Mapeia o nome de um status do Jira para uma etapa canônica do fluxo (dev→QA→homolog→deploy).
 * Checagens ordenadas (a 1ª que casar vence) para evitar ambiguidade entre QA/Homolog/Deploy.
 * Retorna null quando não reconhece — o chamador decide o que fazer (ignorar o intervalo).
 */
export function classifyStage(statusName: string): Stage | null {
  const n = normalizeStatusName(statusName);
  if (!n) return null;

  // Especiais primeiro (o nome engana o mapa genérico):
  if (n === 'DESENV CONCLUIDO') return 'Desenvolvimento';            // dev concluído, não fechamento
  if (/PRONTO (PRA|PARA) DESENVOLVER/.test(n)) return 'Backlog';     // aguardando início, não "DESENV"
  if (/PRONTO PARA PRODUCAO|AGUARDANDO DEPLOY PROD/.test(n)) return 'Homologação/Deploy';

  // Estados finais (têm resolução no Jira):
  if (/\bDONE\b|CONCLUID|EM PRODUCAO|\bPRODUCAO\b|FINALIZAD/.test(n)) return 'Concluído';

  // Homologação / Deploy (deploy PROD já tratado acima):
  if (/HOMOLOG|DEPLOY|PRE.?PROD|STAGING|LIBERAD/.test(n)) return 'Homologação/Deploy';

  // QA / Testes:
  if (/\bQA\b|TESTE|\bUX\b/.test(n)) return 'QA';

  // Desenvolvimento:
  if (/DESENV|DEVELOP|EM ANDAMENTO|EM EXECU|DOING|EM PROGRESSO|CODE REVIEW/.test(n)) return 'Desenvolvimento';

  // Backlog / preparação (refinamento é preparação, não desenvolvimento ativo):
  if (/BACKLOG|PRIORIZAD|IDEIA|DESEJO|ABERTO|NOVAS ATIVIDADES|PRONTO (PRA|PARA) DESENVOLVER|DESCOBERTA|PENDING|SPRINT|REFINAMENTO/.test(n)) return 'Backlog';

  return null;
}

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
