-- ============================================================================
-- Cosmético / documentação: marca as tabelas do Maturity Model ANTIGO (não
-- usadas pelo Portal MMA) e a tabela `votes` (morta desde a sessão colaborativa)
-- com um COMMENT, pra quem abrir o schema no Supabase Studio não confundir
-- tabela legada com ativa. NÃO altera dados nem estrutura.
--
-- Tabelas ATIVAS do MMA (não comentadas): axes, stages, dimensions,
-- dimension_stage_descriptions, anchors, teams (compartilhada), squad_members,
-- assessment_cycles, proposals, homologations, anchor_readings, kaizens,
-- profiles. Views v_cycle_scores / v_axis_scores / v_quarter_comparison.
-- ============================================================================

do $$
begin
  comment on table themes is 'LEGADO (Maturity Model antigo) — não usado pelo Portal MMA.';
  comment on table levels is 'LEGADO (Maturity Model antigo) — não usado pelo Portal MMA.';
  comment on table theme_level_descriptions is 'LEGADO (Maturity Model antigo) — não usado pelo Portal MMA.';
  comment on table assessments is 'LEGADO (Maturity Model antigo) — não usado pelo Portal MMA.';
  comment on table assessment_theme_scores is 'LEGADO (Maturity Model antigo) — não usado pelo Portal MMA.';
  comment on table assessment_answers is 'LEGADO (Maturity Model antigo) — não usado pelo Portal MMA.';
  comment on table questions is 'LEGADO (Maturity Model antigo) — nunca foi usado.';
  comment on table custom_kaizens is 'LEGADO (Maturity Model antigo) — substituído por kaizens.';
  comment on table user_roles is 'LEGADO (Maturity Model antigo) — papéis agora são por squad em squad_members.';
  comment on table votes is 'MORTA desde a sessão colaborativa (voto individual removido). Sem policies. Não usar.';
exception when undefined_table then
  raise notice 'Alguma tabela legada não existe neste ambiente — comentários parciais aplicados.';
end $$;
