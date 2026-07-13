/**
 * Rótulos amigáveis para os times no seletor (dropdown "Times") e no título de TeamDetail.
 *
 * O VALOR canônico (item.Team vindo de /api/data) continua sendo a chave de navegação
 * (/time/:teamId); aqui mapeamos só o TEXTO exibido — sem tocar field-mapper/data.json.
 *
 * Times Salesforce: FUSCA = Pós-Venda Salesforce (cf. tools/scratch/check-team-mapping.ts).
 */
const TEAM_LABELS: Record<string, string> = {
  FUSCA: 'SF Atendimento · Fusca',
  SFMKT: 'SF MktCloud · ID.4',
  SFV: 'SF Vendas',
};

/** Retorna o rótulo amigável do time, ou o próprio valor quando não houver mapeamento. */
export function teamLabel(value: string): string {
  return TEAM_LABELS[value.toUpperCase()] ?? value;
}
