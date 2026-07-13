-- Permite que qualquer AM global reinicie um ciclo ainda não oficializado.
-- Preserva ciclos oficiais/arquivados e limpa somente dados transitórios de teste.
create or replace function restart_assessment(p_team uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_cycle uuid;
  v_status text;
begin
  if not is_any_am() then
    raise exception 'apenas Agile Masters podem reiniciar assessments';
  end if;

  select id, status into v_cycle, v_status
    from assessment_cycles
   where team_id = p_team
   order by quarter desc, created_at desc
   limit 1
   for update;

  if v_cycle is null then
    raise exception 'nenhum assessment encontrado para este squad';
  end if;

  if v_status in ('official', 'archived') then
    raise exception 'assessments oficiais ou arquivados não podem ser reiniciados';
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
