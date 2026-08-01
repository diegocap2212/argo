-- ============================================================================
-- `offboard_person` — desligar alguém é UMA operação, não três cliques.
--
-- O CASO: a pessoa sai da empresa. Isso significa revogar os papéis globais dela E remover os
-- vínculos de squad. Feito pelo cliente em N chamadas, isso MEIO-FALHA: revoga o papel, erra no
-- terceiro squad, e a pessoa fica sem papel mas dentro de dois times. É o pior estado possível,
-- porque a tela já disse "pronto" e ninguém volta a olhar.
--
-- Numa transação só, ou tudo acontece ou nada acontece.
--
-- POR QUE EXIGE AS DUAS PERMISSÕES: desligar é conceder-ao-contrário (`neo.roles.manage`) e
-- mexer em membros (`mma.member.manage`). Quem tem só uma delas faz a metade correspondente
-- pelas telas normais; o atalho que faz as duas de uma vez exige as duas.
--
-- SEM PERMISSÃO NOVA NO CATÁLOGO, de propósito: uma `neo.people.offboard` seria um interruptor
-- a mais para administrar, dizendo o mesmo que a conjunção das duas que já existem.
--
-- O QUE ESTA FUNÇÃO NÃO FAZ: apagar a pessoa. `profiles` e `auth.users` ficam — o histórico de
-- quem conduziu qual assessment tem de continuar legível, e a trilha de auditoria referencia
-- e-mail. Desligar tira o ACESSO, não o registro.
-- ============================================================================

begin;

create or replace function public.offboard_person(p_email text, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email    text := lower(nullif(btrim(p_email), ''));
  v_user     uuid;
  v_roles    int  := 0;
  v_squads   int  := 0;
  v_snapshot jsonb;
begin
  if v_email is null then
    raise exception 'DESLIGAMENTO ABORTADO: informe o e-mail da pessoa.';
  end if;

  -- Motivo obrigatório, como em `restart_assessment`: é ele que responde "por que esta pessoa
  -- perdeu o acesso?" seis meses depois. Sem ele a trilha registra o quê e o quando, e some
  -- exatamente com a informação que se vai procurar.
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'DESLIGAMENTO ABORTADO: o motivo é obrigatório.';
  end if;

  if not (public.has_perm('neo.roles.manage') and public.has_perm('mma.member.manage')) then
    raise exception
      'DESLIGAMENTO ABORTADO: exige as funções de conceder/revogar papéis E de gerenciar membros.';
  end if;

  select p.id into v_user from public.profiles p where lower(p.email) = v_email;

  -- Snapshot ANTES de mexer. Não é backup: é o suficiente para reconstruir à mão e para
  -- responder "o que essa pessoa tinha?".
  v_snapshot := jsonb_build_object(
    'email', v_email,
    'user_id', v_user,
    'papeis', coalesce((
      select jsonb_agg(pr.role order by pr.role)
        from public.portal_roles pr
       where pr.email = v_email and pr.revoked_at is null
    ), '[]'::jsonb),
    'squads', coalesce((
      select jsonb_agg(jsonb_build_object('team_id', sm.team_id, 'role', sm.role) order by sm.team_id)
        from public.squad_members sm
       where sm.user_id = v_user
    ), '[]'::jsonb)
  );

  -- UPDATE, não DELETE: apagar a linha apagaria junto quem concedeu, quando e por quê.
  -- O trigger `stamp_portal_role_grant` carimba `revoked_by` sozinho; e `protect_last_admin`
  -- ABORTA esta transação inteira se isto deixaria o NEO sem nenhum Admin Geral — que é o
  -- comportamento desejado e não precisa de código aqui.
  update public.portal_roles
     set revoked_at = now(), revoke_reason = p_reason
   where email = v_email and revoked_at is null;
  get diagnostics v_roles = row_count;

  -- Pessoa que nunca fez login não tem `user_id`, logo não tem vínculo de squad: o papel some
  -- e os squads são zero. Não é erro.
  if v_user is not null then
    delete from public.squad_members where user_id = v_user;
    get diagnostics v_squads = row_count;
  end if;

  -- Remover alguém de um squad NÃO era auditado até aqui. Agora é.
  insert into public.destructive_audit (action, actor_email, actor_id, reason, snapshot)
  values ('offboard_person', lower(auth.jwt() ->> 'email'), auth.uid(), p_reason, v_snapshot);

  -- Devolve o que foi feito para a tela poder dizer "2 papéis revogados, 3 squads removidos"
  -- em vez de um "pronto" que não informa nada.
  return jsonb_build_object('papeis_revogados', v_roles, 'squads_removidos', v_squads);
end;
$$;

comment on function public.offboard_person(text, text) is
  'Desliga uma pessoa numa transação: revoga papéis globais com motivo e remove vínculos de '
  'squad, gravando snapshot em destructive_audit. Exige neo.roles.manage E mma.member.manage. '
  'Não apaga profiles/auth.users — desligar tira o acesso, não o registro.';

-- Os dois revokes: o bootstrap do Supabase concede `all routines` explicitamente a `anon`, e
-- `revoke from public` não o alcança (documentado em 20260727130000).
revoke all on function public.offboard_person(text, text) from public, anon;
grant execute on function public.offboard_person(text, text) to authenticated;

commit;
