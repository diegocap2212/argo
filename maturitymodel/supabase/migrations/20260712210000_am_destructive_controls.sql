-- Controles destrutivos do Admin: exclusivamente para Agile Masters.
-- O reset pode desfazer um ciclo oficial; a exclusão remove todo o squad.

create or replace function restart_assessment(p_team uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_cycle uuid;
begin
  if not is_any_am() then
    raise exception 'apenas Agile Masters podem reiniciar assessments';
  end if;

  select id into v_cycle
    from assessment_cycles
   where team_id = p_team
   order by quarter desc, created_at desc
   limit 1
   for update;

  if v_cycle is null then
    raise exception 'nenhum assessment encontrado para este squad';
  end if;

  delete from kaizens where cycle_id = v_cycle;
  delete from homologations where cycle_id = v_cycle;
  delete from proposals where cycle_id = v_cycle;
  delete from votes where cycle_id = v_cycle;

  update assessment_cycles
     set status = 'session',
         workshop_at = now(),
         officialized_at = null,
         homologated_by = null
   where id = v_cycle;

  return v_cycle;
end $$;

revoke all on function restart_assessment(uuid) from public;
grant execute on function restart_assessment(uuid) to authenticated;

create or replace function delete_squad(p_team uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_any_am() then
    raise exception 'apenas Agile Masters podem excluir squads';
  end if;

  if not exists (select 1 from teams where id = p_team) then
    raise exception 'squad inexistente';
  end if;

  delete from anchor_readings where team_id = p_team;
  delete from kaizens where team_id = p_team;
  delete from assessment_cycles where team_id = p_team;
  delete from teams where id = p_team;
end $$;

revoke all on function delete_squad(uuid) from public;
grant execute on function delete_squad(uuid) to authenticated;
