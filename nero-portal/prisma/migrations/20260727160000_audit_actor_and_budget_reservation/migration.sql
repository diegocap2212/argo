-- Auditoria com PESSOA, não só tipo de ator (achado 7.4 do review de 2026-07-27).
--
-- `StateVersion.actor` guardava "nero" | "analista": TIPO de ator. Duas pessoas diferentes
-- ficavam indistinguíveis na trilha, enquanto os documentos do produto falavam de
-- "quem/quando". O e-mail sempre esteve disponível — o token do NEO o carrega e
-- `readToken` do @neo/auth existe exatamente "para o e-mail de auditoria" — mas o Nero só
-- verificava a assinatura de forma booleana. Agora o proxy injeta o e-mail validado num
-- header e `recordVersion` o grava.
--
-- Nullable de propósito: escrita fora de request (seed, script) e versões históricas não
-- têm operador. Preencher com um valor falso seria pior que admitir a lacuna.
ALTER TABLE "StateVersion" ADD COLUMN "actorEmail" TEXT;

-- O undo passou a consultar "existe versão POSTERIOR não desfeita desta entidade?" em cada
-- chamada (concorrência otimista, achado 7.6). Sem índice isso é varredura da tabela, que
-- só cresce.
CREATE INDEX "StateVersion_entity_entityId_createdAt_idx"
  ON "StateVersion"("entity", "entityId", "createdAt");

-- ─────────────────────────────────────────────────────────────────────────────
-- Orçamento: reserva atômica + teto por pessoa (achado 7.12).
--
-- O freio era só uma LEITURA do gasto: requisições concorrentes liam o mesmo saldo e passavam
-- todas juntas, e o memo de 30s ampliava a janela. `estimated` marca a RESERVA (custo máximo
-- do turno, gravada ANTES da chamada e reconciliada depois) — o gasto passa a ser visível
-- para os outros leitores no mesmo instante. Como efeito colateral desejado, falha de
-- persistência do consumo real deixa de abrir buraco no orçamento: a estimativa conservadora
-- permanece contada.
--
-- `actorEmail` existe porque o teto era só GLOBAL: uma pessoa podia consumir o mês do time
-- inteiro sem nenhum limite individual.
ALTER TABLE "UsageLog" ADD COLUMN "estimated" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "UsageLog" ADD COLUMN "actorEmail" TEXT;

CREATE INDEX "UsageLog_actorEmail_createdAt_idx" ON "UsageLog"("actorEmail", "createdAt");
