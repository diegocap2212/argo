-- ============================================================================
-- Renomeia a dimensão "Qualidade da Entrega (DoD)" → "Qualidade de Software"
-- e embute (no texto) os sinais que a Michelle cobra: testes automatizados,
-- planos de teste, evidências, homologações e faixas de cobertura de testes.
--
-- Decisão da reunião: NÃO aprofundar a estrutura agora (sem novo tipo de
-- pergunta binária). Só nomenclatura + enriquecimento textual.
--
-- Aditiva e idempotente: mantém o KEY 'qualidade_dod' intacto (hooks, seed e a
-- Edge Function sync-anchors casam por key/metric_key) e apenas ATUALIZA name e
-- descrições. Usa concatenação para preservar o texto original de referência —
-- o marcador '[QSW]' garante que reexecuções não dupliquem o apêndice.
-- ============================================================================

begin;

-- 1. Renomear a dimensão (label exibido; key preservado).
update dimensions
   set name = 'Qualidade de Software'
 where key = 'qualidade_dod';

-- 2. Embutir a ótica de qualidade de software na descrição da dimensão.
update dimensions
   set description = description || $mma$ Sob a ótica de Qualidade de Software, isso inclui testes automatizados e planos de teste, evidências de execução, cobertura de testes proporcional ao risco e homologações registradas — não apenas o aceite informal do PO. [QSW]$mma$
 where key = 'qualidade_dod'
   and description not like '%[QSW]%';

-- 3. Embutir os critérios por estágio (cobertura mapeada 1→4) nas descrições.
update dimension_stage_descriptions
   set description = description || $mma$ Em Qualidade de Software: cobertura de testes praticamente inexistente (abaixo de ~25%) — quase não se testa, não há planos de teste nem evidências, e a homologação, quando ocorre, é informal. [QSW]$mma$
 where dimension_id = (select id from dimensions where key = 'qualidade_dod')
   and stage_number = 1
   and description not like '%[QSW]%';

update dimension_stage_descriptions
   set description = description || $mma$ Em Qualidade de Software: testes automatizados e planos de teste já aparecem, mas de forma inconsistente (cobertura na casa dos ~50%) — evidências e homologações existem em alguns itens e faltam em outros. [QSW]$mma$
 where dimension_id = (select id from dimensions where key = 'qualidade_dod')
   and stage_number = 2
   and description not like '%[QSW]%';

update dimension_stage_descriptions
   set description = description || $mma$ Em Qualidade de Software: testes automatizados são consistentes (cobertura ~70%) — planos de teste, evidências e homologação registrada fazem parte da rotina, não de esforço pontual. [QSW]$mma$
 where dimension_id = (select id from dimensions where key = 'qualidade_dod')
   and stage_number = 3
   and description not like '%[QSW]%';

update dimension_stage_descriptions
   set description = description || $mma$ Em Qualidade de Software: cobertura de testes adequada ao risco (~85%+) — automação madura, evidências e homologações auditáveis, e a qualidade é construída ao longo do fluxo, não inspecionada no fim. [QSW]$mma$
 where dimension_id = (select id from dimensions where key = 'qualidade_dod')
   and stage_number = 4
   and description not like '%[QSW]%';

commit;
