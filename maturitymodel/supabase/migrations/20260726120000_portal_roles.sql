-- ============================================================================
-- Três papéis com significado — decisões do Diego 2026-07-26.
--
-- PROBLEMA RESOLVIDO AQUI: o AM era papel POR SQUAD (`squad_members.role='am'`),
-- então quem homologa só via os squads em que era membro. Sintoma relatado:
-- "salesforce vendas já testou, mas não aparece pra mim que preciso homologar".
--
-- MODELO NOVO:
--   · admin  — faz tudo, inclusive resetar assessment e excluir squad.
--   · AM     — vê TODOS os squads, homologa/oficializa/devolve. NÃO reseta, NÃO exclui,
--              NÃO gerencia membros. Concessão GLOBAL e explícita, por pessoa.
--   · SM     — roda e vê apenas os assessments dos SEUS squads.
--   · member — leitura do próprio squad. Absorve `po`/`tl`/`team`, que não tinham
--              nenhuma consequência funcional (o voto individual morreu na sessão
--              colaborativa; a sessão é gravada só pelo facilitador SM/AM).
--
-- POR QUE NÃO `is_any_am()`: aquela função foi removida em 15/07 como vetor de
-- escalação de privilégio — ser AM de UM squad dava poder em TODOS, derivado e
-- silencioso. Aqui o poder global é uma LINHA NUMA TABELA, auditável, concedida por
-- admin. É o oposto de derivar autoridade de um vínculo de squad.
--
-- EFEITO COLATERAL BOM: o fix de 15/07 (SM se auto-promover a 'am' em squad_members)
-- deixa de ser necessário — o papel 'am' não existe mais naquela tabela. O vetor foi
-- eliminado estruturalmente, não remendado.
--
-- Chaveado por E-MAIL, como o `portal_admins` que ele substitui: permite conceder
-- papel a quem ainda não fez o primeiro login (não existe em auth.users/profiles).
-- ============================================================================

begin;

-- ────────────────────────────────────────────────────────────
-- 1. portal_roles: substitui portal_admins
-- ────────────────────────────────────────────────────────────

create table if not exists public.portal_roles (
  email      text not null check (email = lower(email)),
  role       text not null check (role in ('admin','am')),
  note       text,
  created_at timestamptz not null default now(),
  primary key (email, role)
);

comment on table public.portal_roles is
  'Papéis GLOBAIS do Portal MMA por e-mail de login (JWT). admin = tudo; am = vê todos os squads e homologa, sem resetar/excluir/gerenciar membros. Papel de squad fica em squad_members (sm|member).';

alter table public.portal_roles enable row level security;

-- Admin gerencia; cada pessoa lê os próprios papéis (a UI decide o que mostrar).
drop policy if exists portal_roles_read  on public.portal_roles;
drop policy if exists portal_roles_write on public.portal_roles;

create policy portal_roles_read on public.portal_roles for select to authenticated
  using (email = lower(auth.jwt() ->> 'email') or is_portal_admin());
create policy portal_roles_write on public.portal_roles for all to authenticated
  using (is_portal_admin()) with check (is_portal_admin());

-- ────────────────────────────────────────────────────────────
-- 2. Migração de dados — o passo que resolve o sintoma
-- ────────────────────────────────────────────────────────────

-- 2a. Admins existentes. Condicional: a migration é idempotente e portal_admins
--     deixa de existir no fim dela.
do $$
begin
  if to_regclass('public.portal_admins') is not null then
    insert into public.portal_roles (email, role, note)
      select lower(email), 'admin', note from public.portal_admins
    on conflict (email, role) do nothing;
  end if;
end $$;

-- 2b. ABORTA se algum AM por squad não puder ser resolvido para e-mail. Migrar em
--     silêncio deixaria a pessoa sem o acesso que ela tem hoje — e o sintoma que
--     esta migration existe para curar é exatamente "não vejo o que preciso homologar".
do $$
declare v_orfaos int;
begin
  select count(distinct sm.user_id) into v_orfaos
    from squad_members sm
    left join profiles p on p.id = sm.user_id
   where sm.role = 'am'
     and (p.email is null or btrim(p.email) = '');

  if v_orfaos > 0 then
    raise exception
      'ABORTADO: % AM(s) por squad sem e-mail em profiles. Resolva antes (insira o e-mail em profiles ou adicione a pessoa manualmente em portal_roles), senão ela perde acesso.', v_orfaos;
  end if;
end $$;

-- 2c. Todo AM por squad vira AM GLOBAL. É isto que faz quem homologa passar a ver
--     Salesforce Vendas e todos os outros squads.
insert into public.portal_roles (email, role, note)
  select distinct lower(p.email), 'am', 'promovido de squad_members.role=am em 2026-07-26'
    from squad_members sm
    join profiles p on p.id = sm.user_id
   where sm.role = 'am'
on conflict (email, role) do nothing;

-- 2d. ORDEM OBRIGATÓRIA: derrubar o CHECK **antes** do update.
--     O CHECK antigo é `role in ('team','po','tl','sm','am')` — ele não aceita 'member',
--     então o update abaixo falharia com 23514 se rodasse primeiro. Detectado ao executar
--     a migration em PGlite (tests/pg/rls-local.ts) antes de tocar em banco real.
alter table squad_members drop constraint if exists squad_members_role_check;

-- 2e. Papéis de squad colapsam. Quem era AM continua MEMBRO do squad (o vínculo é
--     real); o que mudou é que a autoridade virou global.
update squad_members set role = 'member' where role in ('am', 'po', 'tl', 'team');

-- 2f. Só agora o banco passa a recusar o papel morto, em vez de depender de disciplina.
alter table squad_members
  add constraint squad_members_role_check check (role in ('sm','member'));

-- ────────────────────────────────────────────────────────────
-- 3. Funções de papel
-- ────────────────────────────────────────────────────────────

-- Mesma assinatura de antes: nenhum call site muda (RPC do app, policies, RPCs).
create or replace function public.is_portal_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    exists (select 1 from public.portal_roles
             where role = 'admin' and email = lower(auth.jwt() ->> 'email')),
    false
  );
$$;

-- Inclui o admin DE PROPÓSITO: "admin geral consegue fazer tudo". Evita repetir
-- `is_portal_admin() or is_portal_am()` em ~15 policies.
-- ⚠️ Por isso NÃO serve para as ações exclusivas de admin (reset/exclusão): essas
-- continuam checando is_portal_admin() diretamente.
create or replace function public.is_portal_am() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    exists (select 1 from public.portal_roles
             where role = 'am' and email = lower(auth.jwt() ->> 'email')),
    false
  ) or public.is_portal_admin();
$$;

-- Um RPC em vez de dois: a home precisa dos dois papéis na primeira renderização.
create or replace function public.my_portal_roles() returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(
    array(select role from public.portal_roles
           where email = lower(auth.jwt() ->> 'email') order by role),
    '{}'::text[]
  );
$$;

grant execute on function public.is_portal_admin()  to authenticated;
grant execute on function public.is_portal_am()     to authenticated;
grant execute on function public.my_portal_roles()  to authenticated;

-- ────────────────────────────────────────────────────────────
-- 4. Leituras: o AM global lê todos os squads
--    Padrão da troca: is_portal_admin() → is_portal_am() (que já contém admin).
-- ────────────────────────────────────────────────────────────

drop policy if exists teams_read on teams;
create policy teams_read on teams for select to authenticated
  using (is_member(id) or is_portal_am());

drop policy if exists sqm_read on squad_members;
create policy sqm_read on squad_members for select to authenticated
  using (user_id = auth.uid() or is_member(team_id) or is_portal_am());

drop policy if exists cycles_read on assessment_cycles;
create policy cycles_read on assessment_cycles for select to authenticated
  using (is_member(team_id) or is_portal_am());

drop policy if exists prop_read on proposals;
create policy prop_read on proposals for select to authenticated
  using (exists (select 1 from assessment_cycles c
                 where c.id = cycle_id and (is_member(c.team_id) or is_portal_am())));

drop policy if exists presession_read on pre_session_assessments;
create policy presession_read on pre_session_assessments for select to authenticated
  using (exists (select 1 from assessment_cycles c
                 where c.id = cycle_id and (is_member(c.team_id) or is_portal_am())));

drop policy if exists homolog_read on homologations;
create policy homolog_read on homologations for select to authenticated
  using (exists (select 1 from assessment_cycles c
                 where c.id = cycle_id and (is_member(c.team_id) or is_portal_am())));

drop policy if exists read_readings on anchor_readings;
create policy read_readings on anchor_readings for select to authenticated
  using (is_member(team_id) or is_portal_am());

drop policy if exists kz_read on kaizens;
create policy kz_read on kaizens for select to authenticated
  using (is_member(team_id) or is_portal_am());

-- O AM vê quem participou dos squads que julga; demais seguem vendo só colegas.
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or is_portal_am() or shares_squad_with(id));

-- ⚠️ VAZAMENTO DE DIRETÓRIO (achado em 2026-07-26, ao executar as migrations em PGlite).
--
-- A policy legada `"Authenticated users can view all profiles"` (SELECT, role `public`,
-- `auth.uid() is not null`) sobreviveu à limpeza de 15/07 — aquela migration derrubou
-- `"Users can view all profiles"` e `profiles_read`, mas não esta, de nome diferente.
--
-- Policies do mesmo comando são somadas com **OR**. Ou seja: a `profiles_read` restritiva
-- acima estava sendo ANULADA, e qualquer usuário autenticado lia o e-mail e o nome de
-- TODAS as pessoas. O "diretório de pessoas fechado", registrado como IMPLEMENTADO em
-- docs/ROLES-REDESIGN.md, nunca esteve fechado de fato.
drop policy if exists "Authenticated users can view all profiles" on public.profiles;
drop policy if exists "Users can view all profiles" on public.profiles;

-- Mesma família: a atualização de perfil dependia de `is_admin(auth.uid())`, que lê a
-- tabela LEGADA `user_roles` (marcada como legado em 20260710140000 e não gerenciada por
-- ninguém). Uma linha esquecida ali dava poder de editar qualquer perfil. Passa a usar a
-- fonte única de autoridade.
drop policy if exists "Admins can update any profile" on public.profiles;
create policy profiles_admin_update on public.profiles for update to authenticated
  using (is_portal_admin()) with check (is_portal_admin());

-- ────────────────────────────────────────────────────────────
-- 5. Escritas do ciclo: facilitador = SM do squad OU AM global
-- ────────────────────────────────────────────────────────────

drop policy if exists cycles_insert on assessment_cycles;
create policy cycles_insert on assessment_cycles for insert to authenticated
  with check (is_sm(team_id) or is_portal_am());

-- `status <> 'official'` continua barrando a oficialização por update direto (só via
-- RPC officialize_cycle). QUEM pode fazer cada transição é o trigger da §7.
drop policy if exists cycles_update on assessment_cycles;
create policy cycles_update on assessment_cycles for update to authenticated
  using (is_sm(team_id) or is_portal_am())
  with check (status <> 'official');

drop policy if exists prop_write on proposals;
create policy prop_write on proposals for all to authenticated
  using (exists (select 1 from assessment_cycles c
                 where c.id = cycle_id
                   and (is_sm(c.team_id) or is_portal_am())
                   and c.status = 'session'))
  with check (exists (select 1 from assessment_cycles c
                 where c.id = cycle_id
                   and (is_sm(c.team_id) or is_portal_am())
                   and c.status = 'session'));

drop policy if exists presession_write on pre_session_assessments;
create policy presession_write on pre_session_assessments for all to authenticated
  using (exists (select 1 from assessment_cycles c
                 where c.id = cycle_id
                   and (is_sm(c.team_id) or is_portal_am())
                   and c.status = 'pre_session'))
  with check (exists (select 1 from assessment_cycles c
                 where c.id = cycle_id
                   and (is_sm(c.team_id) or is_portal_am())
                   and c.status = 'pre_session'));

-- Homologar é do AM global (era do AM do squad).
drop policy if exists homolog_write on homologations;
create policy homolog_write on homologations for insert to authenticated
  with check (
    am_user_id = auth.uid()
    and is_portal_am()
    and exists (select 1 from assessment_cycles c
                where c.id = cycle_id and c.status = 'homologation')
  );

drop policy if exists kz_write on kaizens;
create policy kz_write on kaizens for all to authenticated
  using (is_member(team_id) or is_portal_am())
  with check (is_member(team_id) or is_portal_am());

-- ────────────────────────────────────────────────────────────
-- 6. Estrutura da organização (quem existe, quem está onde, como se chama):
--    SÓ ADMIN. É a linha da matriz "Gerir membros e papéis: só admin".
--    Antes SM/AM editavam o próprio squad — acesso que deixou de fazer sentido
--    agora que o AM é global (editaria QUALQUER squad) e que papel só tem 2 valores.
-- ────────────────────────────────────────────────────────────

drop policy if exists sqm_write on squad_members;
create policy sqm_write on squad_members for all to authenticated
  using (is_portal_admin()) with check (is_portal_admin());

comment on policy sqm_write on squad_members is
  'Membros e papéis de squad: só admin global. O papel am não existe mais aqui (virou portal_roles), o que elimina a escalação SM→AM em vez de remendá-la.';

drop policy if exists teams_write on teams;
create policy teams_write on teams for update to authenticated
  using (is_portal_admin()) with check (is_portal_admin());
-- teams_insert (admin) e a ausência de policy de DELETE seguem como estavam.

-- Diretório de pessoas: buscar por e-mail exato só serve para adicionar ao squad,
-- que agora é ação de admin. Manter para SM seria vazamento sem finalidade.
create or replace function public.find_profile_by_email(p_email text)
returns table (id uuid, email text, full_name text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_portal_admin() then
    raise exception 'apenas o admin do portal pode buscar perfis por e-mail';
  end if;

  return query
    select p.id, p.email, p.full_name
      from profiles p
     where lower(p.email) = lower(trim(p_email))
     limit 1;
end $$;

revoke all on function public.find_profile_by_email(text) from public;
grant execute on function public.find_profile_by_email(text) to authenticated;

-- ────────────────────────────────────────────────────────────
-- 6b. Tabelas legadas: fechar a escrita para `public`
--
-- Achado na mesma auditoria de policies (26/07). As tabelas do Maturity Model ANTIGO —
-- themes, levels, questions, theme_level_descriptions — têm policies `for all to public
-- using (true)`, herdadas do protótipo. `public` inclui `anon`, então qualquer requisição
-- com a chave anônima podia INSERIR e APAGAR nelas.
--
-- Elas estão mortas (marcadas como LEGADO em 20260710140000 e com ZERO referências em
-- src/, verificado). Não têm dado de valor — mas uma primitiva de escrita sem autenticação
-- é achado de pentest de qualquer forma, e apagá-la não tem risco funcional justamente
-- porque nada as lê. As tabelas ficam (drop de tabela é irreversível e não é necessário
-- aqui); só a permissão sai.
-- Os nomes das policies legadas não seguem padrão ("Anyone can view active themes" etc.),
-- então derruba TODAS as que existirem na tabela e recria o par leitura/escrita.
do $$
declare
  v_table text;
  v_policy text;
begin
  foreach v_table in array array['themes','levels','questions','theme_level_descriptions'] loop
    if to_regclass('public.' || v_table) is null then
      continue;
    end if;
    for v_policy in
      select policyname from pg_policies
       where schemaname = 'public' and tablename = v_table
    loop
      execute format('drop policy %I on public.%I', v_policy, v_table);
    end loop;
    -- Leitura para autenticado; escrita só admin, como o conteúdo vivo do modelo.
    execute format(
      'create policy legacy_read on public.%I for select to authenticated using (true)', v_table);
    execute format(
      'create policy legacy_write on public.%I for all to authenticated using (is_portal_admin()) with check (is_portal_admin())',
      v_table);
  end loop;
end $$;

-- ────────────────────────────────────────────────────────────
-- 7. A jornada, no banco: ida e volta
--
-- Até aqui o mapa de transições vivia SÓ no TypeScript (CYCLE_TRANSITIONS), e o
-- banco aceitava qualquer status <> 'official'. Um cliente fora da UI podia pular
-- da pré-sessão direto para homologação. O trigger é o que torna a jornada real —
-- e é onde "conectada aos roles" acontece de fato.
--
--   pre_session  → session       SM do squad ou AM
--   session      → homologation  SM do squad ou AM
--   homologation → official      AM   (na prática via RPC officialize_cycle)
--   homologation → session       AM   ← A VOLTA: devolver o pacote para a sessão
--   official     → archived      AM
--   qualquer     → pre_session   admin (é o restart_assessment)
-- ────────────────────────────────────────────────────────────

-- SECURITY INVOKER (não definer) DE PROPÓSITO — e isto é load-bearing:
--   1. `current_user` precisa ser o do CHAMADOR. Num SECURITY DEFINER ele seria sempre o
--      owner da função, e a checagem de bypass abaixo nunca bateria.
--   2. A função não lê tabela nenhuma (só OLD/NEW), então não precisa de privilégio
--      elevado. `is_portal_admin()`/`is_sm()` já são definer e continuam funcionando.
create or replace function public.enforce_cycle_transition() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.status = old.status then
    return new;
  end if;

  -- O guarda vale para o CLIENTE (app via PostgREST). service_role, postgres e o SQL
  -- editor passam direto: a jornada é regra de produto, não uma trava contra o operador.
  -- Sem esta linha, um ciclo travado num status errado seria IRRECUPERÁVEL — nem seed,
  -- nem script de manutenção, nem o dashboard conseguiriam corrigi-lo.
  --
  -- Os RPCs (officialize_cycle, restart_assessment) são SECURITY DEFINER, então também
  -- caem aqui — e está certo: cada um já checa a própria autorização no corpo.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  -- Admin faz tudo, incluindo o reset para pre_session (restart_assessment).
  if is_portal_admin() then
    return new;
  end if;

  if old.status = 'pre_session' and new.status = 'session' then
    if not (is_sm(new.team_id) or is_portal_am()) then
      raise exception 'apenas o SM do squad ou um AM pode abrir a sessão';
    end if;

  elsif old.status = 'session' and new.status = 'homologation' then
    if not (is_sm(new.team_id) or is_portal_am()) then
      raise exception 'apenas o SM do squad ou um AM pode enviar para homologação';
    end if;

  elsif old.status = 'homologation' and new.status in ('session', 'official') then
    if not is_portal_am() then
      raise exception 'apenas um AM pode homologar ou devolver o pacote para a sessão';
    end if;

  elsif old.status = 'official' and new.status = 'archived' then
    if not is_portal_am() then
      raise exception 'apenas um AM pode arquivar o ciclo';
    end if;

  else
    raise exception 'transição de ciclo inválida: % → %', old.status, new.status;
  end if;

  return new;
end $$;

drop trigger if exists cycle_transition_guard on assessment_cycles;
create trigger cycle_transition_guard
  before update of status on assessment_cycles
  for each row execute function public.enforce_cycle_transition();

-- ────────────────────────────────────────────────────────────
-- 8. RPCs
-- ────────────────────────────────────────────────────────────

-- Oficializar passa a ser do AM GLOBAL. Só o predicado muda: a checagem de
-- completude, o homologated_by e a GERAÇÃO DOS KAIZENS (a etapa "Plano" da jornada)
-- são preservados verbatim de 20260710120200.
--
-- Único acréscimo: `and status = 'homologation'` no update + `if not found`. Sem isso
-- uma segunda chamada no mesmo ciclo já oficializado passava pela checagem de
-- completude e INSERIA OS KAIZENS DE NOVO, duplicando o plano.
create or replace function officialize_cycle(p_cycle uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_team uuid;
  v_dims int;
  v_homs int;
begin
  select team_id into v_team from assessment_cycles where id = p_cycle;
  if v_team is null then raise exception 'ciclo inexistente'; end if;
  if not is_portal_am() then raise exception 'apenas um AM pode oficializar'; end if;

  select count(*) into v_dims from dimensions;
  select count(*) into v_homs from homologations where cycle_id = p_cycle;
  if v_homs < v_dims then
    raise exception 'homologação incompleta: % de % dimensões', v_homs, v_dims;
  end if;

  update assessment_cycles
     set status = 'official', officialized_at = now(), homologated_by = auth.uid()
   where id = p_cycle and status = 'homologation';

  if not found then
    raise exception 'ciclo não está em homologação';
  end if;

  -- gera kaizens sugeridos a partir do estágio oficializado (kaizen do estágio atual,
  -- que descreve o passo para o próximo)
  insert into kaizens (team_id, cycle_id, dimension_id, title, from_stage, to_stage, anchor_id, source)
  select v_team, p_cycle, h.dimension_id,
         coalesce(dsd.kaizen_hint, 'Definir kaizen para ' || d.name),
         floor(h.official_stage)::int,
         least(floor(h.official_stage)::int + 1, 4),
         (select a.id from anchors a where a.dimension_id = h.dimension_id and a.active limit 1),
         'model'
  from homologations h
  join dimensions d on d.id = h.dimension_id
  left join dimension_stage_descriptions dsd
    on dsd.dimension_id = h.dimension_id
   and dsd.stage_number = floor(h.official_stage)::int
  where h.cycle_id = p_cycle
    and floor(h.official_stage) < 4;
end $$;

revoke all on function officialize_cycle(uuid) from public;
grant execute on function officialize_cycle(uuid) to authenticated;

-- restart_assessment: predicado SEGUE admin-only (correto desde 15/07). Três mudanças
-- no corpo, nenhuma na autorização:
--   1. Destino 'pre_session' em vez de 'session'. Desde 24/07 o ciclo NASCE em
--      pre_session, então resetar para 'session' pulava a análise prévia do SM.
--   2. Limpa pre_session_assessments (filho que não existia quando a função foi escrita).
--   3. workshop_at = null em vez de now(): a sessão ainda não aconteceu.
-- Sai também o `delete from votes` — tabela MORTA desde a sessão colaborativa,
-- sem policies e sem escritor. Referenciá-la em código novo só confundiria quem assume.
create or replace function restart_assessment(p_team uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_cycle uuid;
begin
  if not is_portal_admin() then
    raise exception 'apenas o admin do portal pode reiniciar assessments';
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

  delete from kaizens                where cycle_id = v_cycle;
  delete from homologations          where cycle_id = v_cycle;
  delete from proposals              where cycle_id = v_cycle;
  delete from pre_session_assessments where cycle_id = v_cycle;

  update assessment_cycles
     set status = 'pre_session',
         workshop_at = null,
         officialized_at = null,
         homologated_by = null
   where id = v_cycle;

  return v_cycle;
end $$;

revoke all on function restart_assessment(uuid) from public;
grant execute on function restart_assessment(uuid) to authenticated;

-- delete_squad: inalterado (admin-only, já correto). pre_session_assessments cai
-- por `on delete cascade` de assessment_cycles.

-- ────────────────────────────────────────────────────────────
-- 9. Remover o modelo antigo
--    is_am(uuid) sai POR ÚLTIMO e de propósito: enquanto existir, uma policy nova
--    pode voltar ao papel por squad sem ninguém notar. O Postgres recusa o drop se
--    alguma policy ainda referenciar — o erro é a prova de que a §4-§6 ficou completa.
-- ────────────────────────────────────────────────────────────

drop function if exists is_am(uuid);
drop table if exists public.portal_admins;

commit;
