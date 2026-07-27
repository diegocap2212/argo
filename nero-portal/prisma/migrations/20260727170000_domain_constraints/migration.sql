-- ============================================================================
-- Constraints de DOMÍNIO e de UNICIDADE (achado 7.7 do review de 2026-07-27).
--
-- O QUE ESTAVA ERRADO:
--   · 113 campos `String` e 0 enums. Campos comentados no schema como "aguardando | recebido |
--     cancelado" eram promessa de TypeScript sobre coluna `text` livre — o banco aceitava
--     qualquer string, e as server actions passavam status sem validar domínio.
--   · `Dependency.codigo`, `Risk.codigo`, `Feature.codigo`, `StackItem.item` e
--     `PhaseStatus.fase` não tinham unicidade, e as mutações faziam `findFirst → create`.
--     Sob concorrência isso DUPLICA: duas requisições não encontram nada e ambas inserem.
--
-- ESTRATÉGIA DOS CHECKS: `NOT VALID`.
--   `NOT VALID` aplica a constraint a toda escrita NOVA sem varrer as linhas existentes. Isso
--   evita que a migration falhe em cima de dado legado e trave o deploy — mas NÃO limpa o que
--   já está fora do domínio. Depois de conferir/corrigir, rode o bloco de VALIDATE no fim.
--
-- ESTRATÉGIA DOS UNIQUES: sem `NOT VALID` (Postgres não suporta em unique). Se houver
--   duplicata, a migration FALHA — e isso é a informação que importa: significa que a corrida
--   já aconteceu em produção. Use as queries de diagnóstico no fim para achar as duplicatas.
-- ============================================================================

-- ── Domínio (NOT VALID: vale para escrita nova) ─────────────────────────────

ALTER TABLE "StackItem" ADD CONSTRAINT "StackItem_statusVerdade_check"
  CHECK ("statusVerdade" IN ('template', 'assumido', 'confirmado', 'lacuna')) NOT VALID;

ALTER TABLE "CatalogAsset" ADD CONSTRAINT "CatalogAsset_statusVerdade_check"
  CHECK ("statusVerdade" IN ('template', 'assumido', 'confirmado', 'lacuna')) NOT VALID;

ALTER TABLE "MaturityAssessment" ADD CONSTRAINT "MaturityAssessment_statusVerdade_check"
  CHECK ("statusVerdade" IN ('template', 'assumido', 'confirmado', 'lacuna')) NOT VALID;

ALTER TABLE "Dependency" ADD CONSTRAINT "Dependency_status_check"
  CHECK ("status" IN ('aguardando', 'recebido', 'cancelado')) NOT VALID;

ALTER TABLE "Risk" ADD CONSTRAINT "Risk_severidade_check"
  CHECK ("severidade" IN ('Alta', 'Média', 'Baixa')) NOT VALID;

ALTER TABLE "Feature" ADD CONSTRAINT "Feature_status_check"
  CHECK ("status" IN ('nao_iniciada', 'em_andamento', 'concluida', 'bloqueada')) NOT VALID;

ALTER TABLE "PhaseStatus" ADD CONSTRAINT "PhaseStatus_rag_check"
  CHECK ("rag" IN ('cinza', 'amarelo', 'verde', 'vermelho')) NOT VALID;

ALTER TABLE "PhaseStatus" ADD CONSTRAINT "PhaseStatus_pct_check"
  CHECK ("pct" BETWEEN 0 AND 100) NOT VALID;

ALTER TABLE "Report" ADD CONSTRAINT "Report_statusGeral_check"
  CHECK ("statusGeral" IN ('verde', 'amarelo', 'vermelho')) NOT VALID;

-- `operation` é lido pelo undo (`undoVersion`) num if/else de três ramos. Um valor fora deles
-- fazia o undo NÃO FAZER NADA e ainda marcar a versão como desfeita.
ALTER TABLE "StateVersion" ADD CONSTRAINT "StateVersion_operation_check"
  CHECK ("operation" IN ('create', 'update', 'delete')) NOT VALID;

-- Níveis da Roda DAMA: 1–5 (Inicial..Otimizado). Nullable = ainda não avaliado.
ALTER TABLE "MaturityAssessment" ADD CONSTRAINT "MaturityAssessment_nivelAtual_check"
  CHECK ("nivelAtual" IS NULL OR "nivelAtual" BETWEEN 1 AND 5) NOT VALID;
ALTER TABLE "MaturityAssessment" ADD CONSTRAINT "MaturityAssessment_nivelMeta_check"
  CHECK ("nivelMeta" IS NULL OR "nivelMeta" BETWEEN 1 AND 5) NOT VALID;

-- Orçamento: custo negativo abriria espaço no teto mensal em vez de consumi-lo.
ALTER TABLE "UsageLog" ADD CONSTRAINT "UsageLog_costUsd_check"
  CHECK ("costUsd" >= 0) NOT VALID;

-- ── Unicidade das chaves naturais ───────────────────────────────────────────
-- Fecha a corrida `findFirst → create` das mutações. Com o índice, o caminho correto passa a
-- ser `upsert`, que é atômico.
CREATE UNIQUE INDEX "Dependency_codigo_key"  ON "Dependency"("codigo");
CREATE UNIQUE INDEX "Risk_codigo_key"        ON "Risk"("codigo");
CREATE UNIQUE INDEX "Feature_codigo_key"     ON "Feature"("codigo");
CREATE UNIQUE INDEX "StackItem_item_key"     ON "StackItem"("item");
CREATE UNIQUE INDEX "PhaseStatus_fase_key"   ON "PhaseStatus"("fase");

-- ============================================================================
-- PASSOS MANUAIS, quando der para parar de escrever por um instante.
--
-- 1. Achar dado fora do domínio (rodar ANTES de validar):
--      select "statusVerdade", count(*) from "StackItem" group by 1;
--      select "status", count(*) from "Dependency" group by 1;
--      select "severidade", count(*) from "Risk" group by 1;
--      select "status", count(*) from "Feature" group by 1;
--      select "rag", count(*) from "PhaseStatus" group by 1;
--      select "operation", count(*) from "StateVersion" group by 1;
--
-- 2. Corrigir o que aparecer fora da lista e então promover as constraints:
--      ALTER TABLE "StackItem"          VALIDATE CONSTRAINT "StackItem_statusVerdade_check";
--      ALTER TABLE "CatalogAsset"       VALIDATE CONSTRAINT "CatalogAsset_statusVerdade_check";
--      ALTER TABLE "MaturityAssessment" VALIDATE CONSTRAINT "MaturityAssessment_statusVerdade_check";
--      ALTER TABLE "Dependency"         VALIDATE CONSTRAINT "Dependency_status_check";
--      ALTER TABLE "Risk"               VALIDATE CONSTRAINT "Risk_severidade_check";
--      ALTER TABLE "Feature"            VALIDATE CONSTRAINT "Feature_status_check";
--      ALTER TABLE "PhaseStatus"        VALIDATE CONSTRAINT "PhaseStatus_rag_check";
--      ALTER TABLE "PhaseStatus"        VALIDATE CONSTRAINT "PhaseStatus_pct_check";
--      ALTER TABLE "Report"             VALIDATE CONSTRAINT "Report_statusGeral_check";
--      ALTER TABLE "StateVersion"       VALIDATE CONSTRAINT "StateVersion_operation_check";
--      ALTER TABLE "MaturityAssessment" VALIDATE CONSTRAINT "MaturityAssessment_nivelAtual_check";
--      ALTER TABLE "MaturityAssessment" VALIDATE CONSTRAINT "MaturityAssessment_nivelMeta_check";
--      ALTER TABLE "UsageLog"           VALIDATE CONSTRAINT "UsageLog_costUsd_check";
--
-- 3. Se um CREATE UNIQUE INDEX acima falhar, ache a duplicata:
--      select codigo, count(*) from "Dependency" group by 1 having count(*) > 1;
--    (idem para Risk.codigo, Feature.codigo, StackItem.item, PhaseStatus.fase)
-- ============================================================================
