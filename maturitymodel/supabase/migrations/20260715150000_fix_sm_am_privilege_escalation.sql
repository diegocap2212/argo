-- ============================================================================
-- Fix da escalada de privilégio SM → AM (achado do QA 2026-07-15).
--
-- Problema: a policy sqm_write (20260715120000) autoriza is_sm(team_id) a
-- escrever QUALQUER linha de squad_members do próprio squad — inclusive uma
-- linha com role='am'. Um SM podia então promover a si mesmo (ou outro) a AM,
-- e AM satisfaz is_am(team) — a autoridade que officialize_cycle/homolog_write
-- confiam. Resultado: SM → AM → homologa/oficializa.
--
-- Correção: um gestor continua gerenciando os membros do próprio squad, MAS
-- só admin global ou um AM já existente daquele squad pode CRIAR/definir o
-- papel 'am'. SM nunca escreve linhas com role='am' (nem para si mesmo).
-- Onboarding de AM segue pelo admin global (Diego/Tiago), como já documentado.
-- ============================================================================

drop policy if exists sqm_write on squad_members;

create policy sqm_write on squad_members for all to authenticated
  using (is_portal_admin() or is_am(team_id) or is_sm(team_id))
  with check (
    (is_portal_admin() or is_am(team_id) or is_sm(team_id))
    -- Conceder o papel 'am' exige admin global ou AM já existente do squad.
    -- SM (que não é admin nem am) falha o WITH CHECK ao tentar gravar role='am'.
    and (role <> 'am' or is_portal_admin() or is_am(team_id))
  );

comment on policy sqm_write on squad_members is
  'Gestor (SM/AM/admin) gerencia membros do próprio squad; papel am só por admin global ou AM existente do squad (bloqueia auto-promoção SM→AM).';
