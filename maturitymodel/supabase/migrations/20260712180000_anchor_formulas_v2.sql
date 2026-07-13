-- ============================================================================
-- Âncoras v2 — fórmulas fundamentadas na descoberta do Jira grupolm (2026-07-12).
-- Só ajusta rótulo/alvos de 2 âncoras cuja SEMÂNTICA mudou na Edge Function
-- (sync-anchors). As demais mantêm metric_key, comparator e stage_targets.
--
--  • sprint.gmud_inside_count: GMUD não é rastreado no Jira desses squads
--    (Fura Fila 0%, campos GMUD ~0%). Passou a medir "itens injetados na sprint
--    após o início" (escopo não planejado), via changelog do campo Sprint.
--  • panel.staleness_days: deixou de ser "atividade mais recente" (recência, que
--    quase sempre sustenta) e passou a ser "idade do card em andamento (WIP) mais
--    desatualizado" — daí alvos maiores e por estágio.
-- ============================================================================

update anchors
   set name = 'Itens injetados na sprint após o início'
 where metric_key = 'sprint.gmud_inside_count';

update anchors
   set name = 'Card em andamento mais desatualizado',
       unit = 'dias',
       stage_targets = '{"2":5,"3":3,"4":2}'::jsonb
 where metric_key = 'panel.staleness_days';
