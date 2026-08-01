-- ============================================================================
-- Rollback de 20260731140000_offboard_person.sql
--
-- Só a função sai. As linhas que ela gravou em `destructive_audit` FICAM: trilha de auditoria
-- é append-only, e apagar o registro de um desligamento junto com a ferramenta que o fez é
-- destruir a prova de uma decisão que aconteceu de verdade.
--
-- Efeito prático de rodar isto: o botão "Desligar" da ficha passa a dar erro. Revogar papel e
-- remover de squad seguem funcionando pelas telas normais — o que se perde é a atomicidade e
-- a trilha, que era exatamente o motivo de a função existir.
-- ============================================================================

begin;

drop function if exists public.offboard_person(text, text);

commit;
