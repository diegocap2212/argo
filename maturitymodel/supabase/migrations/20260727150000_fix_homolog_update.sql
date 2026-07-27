-- ============================================================================
-- `homolog_update` ficou no modelo ANTIGO de papéis (achado 6.3 do review de 2026-07-27).
--
-- A migration 20260726120000_portal_roles.sql trocou `homolog_write` (INSERT) e
-- `homolog_read` (SELECT) para o modelo de AM GLOBAL, mas NÃO trocou `homolog_update`. A
-- policy vigente até aqui é a de 20260710130000:
--
--   using       (am_user_id = auth.uid() and exists (... cycle em 'homologation'))
--   with check  (am_user_id = auth.uid())
--
-- Três problemas concretos:
--
--   1. NÃO exige `is_portal_am()`. Quem perdeu o papel de AM continua podendo editar as
--      homologações que criou — o papel deixou de ser a fonte da permissão.
--   2. O `WITH CHECK` não exige que o ciclo DESTINO esteja em homologação, nem que
--      `cycle_id`/`dimension_id` permaneçam os mesmos. O dono podia mover a linha para
--      outro ciclo/dimensão conhecido — reescrevendo o resultado oficial de outra avaliação.
--   3. Outro AM global NÃO consegue atualizar homologação criada por um colega. Como o
--      frontend usa `upsert`, o UPDATE é o caminho real quando a linha já existe: o fluxo de
--      "AM global homologa qualquer squad" quebrava em silêncio na segunda edição.
--
-- Os testes cobriam INSERT e oficialização, nunca UPDATE cruzado nem mutação de chave — por
-- isso passou. tests/pg/rls-local.ts agora cobre.
-- ============================================================================
begin;

drop policy if exists homolog_update on homologations;

create policy homolog_update on homologations for update to authenticated
  using (
    -- Quem pode MEXER: qualquer AM/admin global, e só enquanto o ciclo está em homologação.
    -- Deixou de ser "o dono da linha" e passou a ser "quem tem o papel".
    is_portal_am()
    and exists (
      select 1 from assessment_cycles c
       where c.id = cycle_id and c.status = 'homologation'
    )
  )
  with check (
    is_portal_am()
    -- O ciclo DESTINO também tem de estar em homologação: sem isto, dava para empurrar a
    -- linha para um ciclo já oficializado.
    and exists (
      select 1 from assessment_cycles c
       where c.id = cycle_id and c.status = 'homologation'
    )
  );

-- A imutabilidade de `cycle_id`/`dimension_id` não cabe em `WITH CHECK` (ele não vê a linha
-- ANTIGA — só a nova). Trigger é o lugar certo.
--
-- `(cycle_id, dimension_id)` é a PK, então mover a linha é reidentificá-la: o registro
-- passaria a valer para outra avaliação, levando `official_stage` e `justification` consigo.
-- Corrigir uma homologação errada é UPDATE dos campos de conteúdo; mudar de qual dimensão ela
-- fala é DELETE + INSERT, deliberado.
create or replace function public.homolog_keys_immutable() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if new.cycle_id is distinct from old.cycle_id
     or new.dimension_id is distinct from old.dimension_id then
    raise exception
      'homologação não muda de ciclo/dimensão (de %/% para %/%). Use DELETE + INSERT.',
      old.cycle_id, old.dimension_id, new.cycle_id, new.dimension_id;
  end if;
  return new;
end
$$;

drop trigger if exists homolog_keys_immutable_trg on homologations;
create trigger homolog_keys_immutable_trg
  before update on homologations
  for each row execute function public.homolog_keys_immutable();

commit;
