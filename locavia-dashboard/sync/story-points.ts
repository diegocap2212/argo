// Fonte única de verdade para extração de story points do Jira.
// Usado tanto pelo sync principal (field-mapper) quanto pelo SFMKT.
//
// Os IDs variam por tipo de projeto neste Jira:
//   - customfield_10026 = "Story Points" (projetos clássicos / company-managed)
//   - customfield_10016 = "Story point estimate" (projetos team-managed / next-gen)
// Os demais ficam como fallback defensivo.
export const STORY_POINTS_FIELDS = [
  'customfield_10026', // Story Points (clássico) — principal neste Jira
  'customfield_10016', // Story point estimate (team-managed)
  'customfield_10028', // Story Points (variação clássica em outras instâncias)
  'story_points',
];

// Retorna o primeiro valor numérico não-nulo encontrado entre os campos candidatos.
export function extractStoryPoints(fields: Record<string, any>): number | null {
  for (const f of STORY_POINTS_FIELDS) {
    if (fields[f] !== undefined && fields[f] !== null) {
      const val = Number(fields[f]);
      if (!isNaN(val)) return val;
    }
  }
  return null;
}
