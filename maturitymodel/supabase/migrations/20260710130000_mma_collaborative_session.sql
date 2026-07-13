-- ============================================================================
-- Revisão do fluxo: voto individual sigiloso → sessão colaborativa (SM registra
-- a nota de consenso; os demais acompanham em leitura). Homologação do AM mantida.
--
-- Estados do ciclo passam de:
--   voting → workshop → proposed → homologation → official → archived
-- para:
--   session → homologation → official → archived
--
-- A tabela `votes` fica no schema mas DEIXA DE SER USADA (sem drop destrutivo).
-- ============================================================================

begin;

-- 1. Remove o único ciclo residual em 'voting' (vazio — sem votos/propostas).
--    Era resíduo de teste (squad Nivus). Fresh start sob o novo modelo.
delete from assessment_cycles where status = 'voting';

-- 2. Troca o CHECK de status pelos novos estados.
alter table assessment_cycles drop constraint assessment_cycles_status_check;
alter table assessment_cycles
  add constraint assessment_cycles_status_check
  check (status in ('session','homologation','official','archived'));
alter table assessment_cycles alter column status set default 'session';

-- 3. Propostas: agora escritas na SESSÃO, pelo facilitador (SM ou AM), enquanto
--    o ciclo está em 'session'. (Antes: só SM, em workshop/proposed.)
drop policy if exists prop_write on proposals;
create policy prop_write on proposals for all to authenticated
  using (exists (select 1 from assessment_cycles c
                 where c.id = cycle_id
                   and (is_sm(c.team_id) or is_am(c.team_id))
                   and c.status = 'session'))
  with check (exists (select 1 from assessment_cycles c
                 where c.id = cycle_id
                   and (is_sm(c.team_id) or is_am(c.team_id))
                   and c.status = 'session'));

-- 4. Homologações: só no estado 'homologation' (não existe mais 'proposed').
drop policy if exists homolog_write on homologations;
create policy homolog_write on homologations for insert to authenticated
  with check (
    am_user_id = auth.uid()
    and exists (select 1 from assessment_cycles c
                where c.id = cycle_id and is_am(c.team_id)
                  and c.status = 'homologation')
  );

drop policy if exists homolog_update on homologations;
create policy homolog_update on homologations for update to authenticated
  using (am_user_id = auth.uid()
    and exists (select 1 from assessment_cycles c
                where c.id = cycle_id and c.status = 'homologation'))
  with check (am_user_id = auth.uid());

-- 5. Votos: tabela morta no novo modelo. Remove as policies (que referenciavam
--    'voting'/revelação). RLS fica habilitada sem policy = sem acesso, o que é
--    o correto para uma tabela que ninguém mais lê/escreve.
drop policy if exists votes_insert on votes;
drop policy if exists votes_update_own on votes;
drop policy if exists votes_select_own on votes;
drop policy if exists votes_select_revealed on votes;

commit;
