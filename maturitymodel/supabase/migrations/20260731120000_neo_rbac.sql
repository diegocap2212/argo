-- ============================================================================
-- RBAC do NEO — permissão vira DADO, e a matriz papel × função vira editável.
--
-- PROBLEMA RESOLVIDO AQUI: "quem pode o quê" estava espalhado em 34 policies e em
-- TypeScript. Todo ajuste era migration + deploy, e ninguém fora da engenharia conseguia
-- administrar. Também não havia distinção entre *governar acesso* (conceder papel) e
-- *operar a estrutura* (criar squad, resetar assessment, editar conteúdo) — o `admin`
-- acumulava as duas.
--
-- MODELO NOVO — dois níveis que já existiam, agora com a matriz por fora:
--
--   PAPEL GLOBAL (portal_roles, por e-mail)     PAPEL DE SQUAD (squad_members)
--     · admin_geral — governa acesso              · sm     — facilita um squad
--     · admin       — opera tudo o resto          · member — participa de um squad
--     · am          — vê todos, homologa
--     · todos       — IMPLÍCITO (ver §5)
--
--   neo_permissions      catálogo de ações, em linguagem de negócio
--   neo_role_permissions A MATRIZ — editável pelo app de administração
--   has_perm(perm, team) o predicado único que toda policy passa a chamar
--
-- POR QUE O MESMO PERMISSION_ID SERVE AOS DOIS NÍVEIS: `has_perm('mma.cycle.homologate',
-- team)` é verdadeiro se a pessoa tem a permissão por papel GLOBAL (→ vale em todos os
-- squads) OU por papel de SQUAD naquele squad (→ vale só nele). A autoridade — local ou
-- global — é carregada por QUAL papel detém a permissão, não por duas permissões
-- diferentes. É isso que dispensa um `view_all` separado de um `read_own`.
--
-- ⚠️ CONSEQUÊNCIA A ENTENDER ANTES DE MEXER NA MATRIZ: ligar uma permissão de squad para
-- um papel GLOBAL significa "em todos os squads". Ligar `mma.squad.read` para `todos`
-- abriria todos os squads para a empresa inteira. Não é bug, é o significado — e é por isso
-- que a tela precisa rotular as colunas globais como "em todos os squads".
--
-- ORDEM LOAD-BEARING (§8): o CHECK de `portal_roles.role` e o trigger `protect_last_admin`
-- têm de ser tratados ANTES do rename `admin` → `admin_geral`. O CHECK antigo é
-- `role in ('admin','am')` e não aceita o valor novo; o trigger antigo vê o rename como
-- "removeram o último admin" e aborta. É a mesma pegadinha registrada no §2d de
-- 20260726120000, que só apareceu ao EXECUTAR a migration.
-- ============================================================================

begin;

-- ────────────────────────────────────────────────────────────
-- 1. Papéis como dado
-- ────────────────────────────────────────────────────────────

create table if not exists public.neo_roles (
  id          text primary key,
  label       text not null,
  description text not null,
  -- 'global' = concedido por e-mail em portal_roles. 'squad' = vínculo em squad_members.
  scope       text not null check (scope in ('global', 'squad')),
  -- Ordem de exibição na matriz (do menos ao mais poderoso).
  rank        int  not null,
  -- `todos` é false: ninguém "recebe" o papel implícito. Ver §5.
  grantable   boolean not null default true
);

comment on table public.neo_roles is
  'Os papéis do NEO. Tabela pequena e controlada: papel NOVO é migration (muda o significado '
  'do sistema). O que é editável pelo app de administração é a MATRIZ (neo_role_permissions), '
  'não esta lista.';

insert into public.neo_roles (id, label, description, scope, rank, grantable) values
  ('todos', 'Todos',
   'Toda pessoa com acesso ao NEO, mesmo sem papel nenhum. É a linha que mantém as portas abertas para quem apenas trabalha na empresa.',
   'global', 0, false),
  ('member', 'Member',
   'Participa de um squad: acompanha o assessment dele e executa o plano de ação.',
   'squad', 1, true),
  ('sm', 'SM',
   'Facilita o assessment dos squads em que é SM: análise prévia, sessão e envio para homologação.',
   'squad', 2, true),
  ('am', 'AM',
   'Autoridade de método em TODOS os squads: homologa, oficializa, devolve e arquiva. Não mexe na estrutura da organização.',
   'global', 3, true),
  ('admin', 'Admin',
   'Opera a estrutura: squads, membros, conteúdo do modelo e ações destrutivas. NÃO concede papéis nem edita a matriz de permissões.',
   'global', 4, true),
  ('admin_geral', 'Admin Geral',
   'Governa o acesso: além de tudo o que o Admin faz, é quem concede e revoga papéis e edita a matriz de papéis × funções.',
   'global', 5, true)
on conflict (id) do update
  set label = excluded.label, description = excluded.description,
      scope = excluded.scope, rank = excluded.rank, grantable = excluded.grantable;

-- ────────────────────────────────────────────────────────────
-- 2. Catálogo de permissões
--
-- `label` é a FRASE que uma pessoa leiga lê na tela — não o identificador. O id só aparece
-- em detalhe/tooltip. `scope` aqui é documentação para a UI ("esta ação acontece dentro de
-- um squad"), não uma restrição: ver o aviso do cabeçalho.
-- ────────────────────────────────────────────────────────────

create table if not exists public.neo_permissions (
  id          text primary key,
  app         text not null check (app in ('neo', 'mma', 'dash', 'nero')),
  group_label text not null,
  label       text not null,
  description text not null,
  scope       text not null check (scope in ('global', 'squad')),
  rank        int  not null
);

comment on table public.neo_permissions is
  'Catálogo de ações que o NEO sabe autorizar. Permissão nova é migration + o has_perm() '
  'correspondente numa policy — inventar a linha aqui sem usá-la em lugar nenhum só produz '
  'um interruptor que não acende nada. tests/perm-catalog.ts guarda os dois lados.';

insert into public.neo_permissions (id, app, group_label, label, description, scope, rank) values
  -- ── Portas do NEO ──
  ('neo.dash.access', 'neo', 'Portas do NEO', 'Entrar no Performance Dash',
   'Abre a porta do Dash de performance no hub do NEO.', 'global', 10),
  ('neo.mma.access', 'neo', 'Portas do NEO', 'Entrar no Portal MMA',
   'Abre a porta do Modelo de Maturidade Ágil no hub do NEO.', 'global', 11),
  ('neo.nero.access', 'neo', 'Portas do NEO', 'Entrar no Nero',
   'Abre a porta do Nero, o advisor de governança de dados. Substituiu a senha compartilhada.', 'global', 12),
  ('neo.admin.access', 'neo', 'Portas do NEO', 'Entrar na Administração',
   'Abre a porta desta área de administração.', 'global', 13),

  -- ── Governança de acesso ──
  ('neo.roles.manage', 'neo', 'Governança de acesso', 'Conceder e revogar papéis de pessoas',
   'Define quem é AM, Admin ou Admin Geral. É o poder de dar poder.', 'global', 20),
  ('neo.matrix.manage', 'neo', 'Governança de acesso', 'Editar a matriz de papéis × funções',
   'Liga e desliga o que cada papel pode fazer — inclusive esta permissão.', 'global', 21),
  ('neo.access.manage', 'neo', 'Governança de acesso', 'Gerenciar quem pode entrar no NEO',
   'Mantém a lista de exceções de acesso para e-mails fora do domínio da empresa.', 'global', 22),
  ('neo.audit.read', 'neo', 'Governança de acesso', 'Ver as trilhas de auditoria',
   'Lê o histórico de ações destrutivas, de concessões de papel e de mudanças na matriz.', 'global', 23),
  ('neo.people.read_all', 'neo', 'Governança de acesso', 'Ver o diretório de pessoas',
   'Lê nome e e-mail de todas as pessoas, e não apenas de quem compartilha squad.', 'global', 24),
  ('neo.people.edit_any', 'neo', 'Governança de acesso', 'Editar o perfil de qualquer pessoa',
   'Corrige nome e dados de perfil de outra pessoa.', 'global', 25),

  -- ── MMA · estrutura da organização ──
  ('mma.squad.create', 'mma', 'Estrutura da organização', 'Criar squad',
   'Cadastra um squad novo no portal.', 'global', 30),
  ('mma.squad.update', 'mma', 'Estrutura da organização', 'Editar nome e torre do squad',
   'Renomeia um squad ou muda a torre a que ele pertence.', 'global', 31),
  ('mma.squad.delete', 'mma', 'Estrutura da organização', 'Excluir squad permanentemente',
   'Apaga o squad e tudo que está vinculado a ele. Não pode ser desfeito.', 'global', 32),
  ('mma.member.manage', 'mma', 'Estrutura da organização', 'Adicionar e remover membros de squads',
   'Define quem está em qual squad e se é SM ou member.', 'global', 33),
  ('mma.content.edit', 'mma', 'Estrutura da organização', 'Editar o conteúdo do modelo',
   'Muda eixos, dimensões, estágios e âncoras — a régua com que todos os squads são avaliados.', 'global', 34),

  -- ── MMA · assessment (dentro de um squad) ──
  ('mma.squad.read', 'mma', 'Assessment', 'Ver o squad e seus assessments',
   'Enxerga o squad, os ciclos, as notas e o plano de ação. Num papel global, vale para todos os squads.', 'squad', 40),
  ('mma.cycle.create', 'mma', 'Assessment', 'Iniciar um assessment',
   'Abre um ciclo novo de avaliação para o squad.', 'squad', 41),
  ('mma.cycle.presession', 'mma', 'Assessment', 'Rodar a análise prévia',
   'Preenche a avaliação individual que antecede a sessão colaborativa.', 'squad', 42),
  ('mma.cycle.session', 'mma', 'Assessment', 'Rodar a sessão colaborativa',
   'Facilita a sessão e registra as propostas de estágio do time.', 'squad', 43),
  ('mma.cycle.submit', 'mma', 'Assessment', 'Enviar para homologação',
   'Fecha a sessão e manda o pacote para a homologação do AM.', 'squad', 44),
  ('mma.cycle.homologate', 'mma', 'Assessment', 'Homologar e oficializar o resultado',
   'Define o estágio oficial de cada dimensão e publica o resultado, gerando o plano de kaizens.', 'squad', 45),
  ('mma.cycle.return', 'mma', 'Assessment', 'Devolver a homologação para a sessão',
   'Manda o pacote de volta ao time quando a homologação não passa.', 'squad', 46),
  ('mma.cycle.archive', 'mma', 'Assessment', 'Arquivar um ciclo oficial',
   'Encerra um ciclo já publicado.', 'squad', 47),
  ('mma.cycle.restart', 'mma', 'Assessment', 'Reiniciar o assessment do zero',
   'APAGA análise prévia, sessão, homologações, resultado oficial e kaizens do ciclo. Exige motivo e fica auditado.', 'squad', 48),
  ('mma.kaizen.write', 'mma', 'Assessment', 'Criar e editar kaizens',
   'Mantém o plano de ação do squad. A execução é do time.', 'squad', 49),
  ('mma.kaizen.delete', 'mma', 'Assessment', 'Excluir kaizen',
   'Remove um item do plano. Kaizen gerado na oficialização é resultado de ritual, não rascunho.', 'squad', 50),
  ('mma.anchor.sync', 'mma', 'Assessment', 'Sincronizar as âncoras do squad',
   'Puxa as métricas objetivas do Jira que alimentam a avaliação.', 'squad', 51),
  ('mma.people.find', 'mma', 'Estrutura da organização', 'Buscar pessoa por e-mail exato',
   'Localiza um perfil pelo e-mail para poder adicioná-lo a um squad.', 'global', 35),

  -- ── Dash ──
  ('dash.tower.view', 'dash', 'Performance Dash', 'Ver o comparativo entre agilistas (Torre)',
   'Abre o comparativo consolidado SM × SM e time × time. Substituiu a senha compartilhada da Torre.', 'global', 60)
on conflict (id) do update
  set app = excluded.app, group_label = excluded.group_label, label = excluded.label,
      description = excluded.description, scope = excluded.scope, rank = excluded.rank;

-- ────────────────────────────────────────────────────────────
-- 3. A MATRIZ
-- ────────────────────────────────────────────────────────────

create table if not exists public.neo_role_permissions (
  role_id       text not null references public.neo_roles(id) on delete cascade,
  permission_id text not null references public.neo_permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

comment on table public.neo_role_permissions is
  'A matriz papel × função, editável pelo app de administração. Fonte da verdade da '
  'autorização: has_perm() lê daqui, e toda policy chama has_perm().';

-- ────────────────────────────────────────────────────────────
-- 4. Trilha da matriz
--
-- Escrita por TRIGGER, não pela aplicação. Confiar na app para registrar é o mesmo que não
-- ter trilha: basta um caminho de escrita esquecer. Mesmo raciocínio do
-- `stamp_portal_role_grant` em 20260727180000.
-- ────────────────────────────────────────────────────────────

create table if not exists public.neo_role_permissions_audit (
  id            uuid primary key default gen_random_uuid(),
  at            timestamptz not null default now(),
  actor_email   text,
  role_id       text not null,
  permission_id text not null,
  action        text not null check (action in ('grant', 'revoke'))
);

comment on table public.neo_role_permissions_audit is
  'Append-only: quem mudou a matriz, quando e em que direção. Sem policy de escrita para '
  '`authenticated` — só o trigger escreve.';

create or replace function public.audit_role_permission() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.neo_role_permissions_audit (actor_email, role_id, permission_id, action)
  values (
    lower(auth.jwt() ->> 'email'),
    coalesce(new.role_id, old.role_id),
    coalesce(new.permission_id, old.permission_id),
    case when tg_op = 'INSERT' then 'grant' else 'revoke' end
  );
  return coalesce(new, old);
end $$;

-- ────────────────────────────────────────────────────────────
-- 5. Matriz semente = O COMPORTAMENTO DE HOJE
--
-- Toda linha aqui existe para PRESERVAR uma autorização que já vale em produção. A única
-- decisão nova é a divisão admin_geral × admin (as duas últimas linhas de admin_geral).
--
-- `todos` guarda o que hoje NÃO depende de papel: qualquer pessoa da allowlist entra em
-- /dash e /maturity. Sem esta linha, a virada trancaria fora todo mundo que não está num
-- squad — o RBAC quebraria a empresa em vez de organizá-la.
--
-- ⚠️ `neo.nero.access` e `dash.tower.view` são as linhas a CONFERIR antes do deploy. Hoje
-- quem entra é quem sabe a senha compartilhada, e não existe registro de quem são. A
-- semente chuta AM/Admin/Admin Geral; se a lista real for outra, é conceder papel ou ligar
-- a permissão para `todos` ANTES de a senha sair do ar.
-- ────────────────────────────────────────────────────────────

insert into public.neo_role_permissions (role_id, permission_id) values
  -- todos: as portas que hoje não pedem papel nenhum.
  --
  -- CONFERIDO E MANTIDO (Diego, 31/07): toda pessoa com acesso ao NEO entra no Dash e no MMA.
  -- No MMA isso é só a PORTA — `mma.squad.read` é permissão de squad, então SM e member seguem
  -- vendo apenas os próprios. No Dash a porta é tudo o que existe: ele não tem recorte por time,
  -- e a decisão foi manter assim (ver SECURITY.md §6.1). Desligar estas duas linhas trancaria
  -- fora todo mundo que não está num squad.
  ('todos', 'neo.dash.access'),
  ('todos', 'neo.mma.access'),

  -- member: lê o próprio squad e mantém o plano de ação
  ('member', 'mma.squad.read'),
  ('member', 'mma.kaizen.write'),

  -- sm: conduz o assessment dos SEUS squads
  ('sm', 'mma.squad.read'),
  ('sm', 'mma.kaizen.write'),
  ('sm', 'mma.cycle.create'),
  ('sm', 'mma.cycle.presession'),
  ('sm', 'mma.cycle.session'),
  ('sm', 'mma.cycle.submit'),
  ('sm', 'mma.anchor.sync'),

  -- am: autoridade de método em TODOS os squads
  ('am', 'neo.dash.access'),
  ('am', 'neo.mma.access'),
  ('am', 'neo.nero.access'),
  ('am', 'neo.audit.read'),
  ('am', 'neo.people.read_all'),
  ('am', 'dash.tower.view'),
  ('am', 'mma.squad.read'),
  ('am', 'mma.kaizen.write'),
  ('am', 'mma.cycle.create'),
  ('am', 'mma.cycle.presession'),
  ('am', 'mma.cycle.session'),
  ('am', 'mma.cycle.submit'),
  ('am', 'mma.cycle.homologate'),
  ('am', 'mma.cycle.return'),
  ('am', 'mma.cycle.archive'),
  ('am', 'mma.anchor.sync'),

  -- admin: tudo do AM + a estrutura da organização e as ações destrutivas
  ('admin', 'neo.dash.access'),
  ('admin', 'neo.mma.access'),
  ('admin', 'neo.nero.access'),
  ('admin', 'neo.admin.access'),
  -- `neo.access.manage` NÃO entra aqui, e a ausência é a decisão (Diego, 31/07): manter a
  -- allowlist de quem consegue ENTRAR no NEO é governança de acesso, não operação da estrutura
  -- — mesma família de `neo.roles.manage` e `neo.matrix.manage`, que também são só do Admin
  -- Geral. Se um dia o Admin precisar, é ligar a célula na tela, não migration.
  ('admin', 'neo.audit.read'),
  ('admin', 'neo.people.read_all'),
  ('admin', 'neo.people.edit_any'),
  ('admin', 'dash.tower.view'),
  ('admin', 'mma.squad.create'),
  ('admin', 'mma.squad.update'),
  ('admin', 'mma.squad.delete'),
  ('admin', 'mma.member.manage'),
  ('admin', 'mma.content.edit'),
  ('admin', 'mma.people.find'),
  ('admin', 'mma.squad.read'),
  ('admin', 'mma.kaizen.write'),
  ('admin', 'mma.kaizen.delete'),
  ('admin', 'mma.cycle.create'),
  ('admin', 'mma.cycle.presession'),
  ('admin', 'mma.cycle.session'),
  ('admin', 'mma.cycle.submit'),
  ('admin', 'mma.cycle.homologate'),
  ('admin', 'mma.cycle.return'),
  ('admin', 'mma.cycle.archive'),
  ('admin', 'mma.cycle.restart'),
  ('admin', 'mma.anchor.sync'),

  -- admin_geral: tudo do Admin + governar o acesso (as duas linhas que são a decisão nova)
  ('admin_geral', 'neo.dash.access'),
  ('admin_geral', 'neo.mma.access'),
  ('admin_geral', 'neo.nero.access'),
  ('admin_geral', 'neo.admin.access'),
  ('admin_geral', 'neo.access.manage'),
  ('admin_geral', 'neo.audit.read'),
  ('admin_geral', 'neo.people.read_all'),
  ('admin_geral', 'neo.people.edit_any'),
  ('admin_geral', 'dash.tower.view'),
  ('admin_geral', 'mma.squad.create'),
  ('admin_geral', 'mma.squad.update'),
  ('admin_geral', 'mma.squad.delete'),
  ('admin_geral', 'mma.member.manage'),
  ('admin_geral', 'mma.content.edit'),
  ('admin_geral', 'mma.people.find'),
  ('admin_geral', 'mma.squad.read'),
  ('admin_geral', 'mma.kaizen.write'),
  ('admin_geral', 'mma.kaizen.delete'),
  ('admin_geral', 'mma.cycle.create'),
  ('admin_geral', 'mma.cycle.presession'),
  ('admin_geral', 'mma.cycle.session'),
  ('admin_geral', 'mma.cycle.submit'),
  ('admin_geral', 'mma.cycle.homologate'),
  ('admin_geral', 'mma.cycle.return'),
  ('admin_geral', 'mma.cycle.archive'),
  ('admin_geral', 'mma.cycle.restart'),
  ('admin_geral', 'mma.anchor.sync'),
  ('admin_geral', 'neo.roles.manage'),
  ('admin_geral', 'neo.matrix.manage')
on conflict (role_id, permission_id) do nothing;

-- ────────────────────────────────────────────────────────────
-- 5b. A matriz SEMENTE, congelada — o "restaurar padrão" da tela
--
-- A tela de matriz precisa oferecer "voltar ao padrão" para quem mexeu e não sabe o que fez.
-- Sem isto, o padrão só existiria dentro deste arquivo, que a aplicação não lê — e a única
-- forma de desfazer seria alguém reconstituir a matriz de cabeça.
--
-- COPIADA de `neo_role_permissions` EM VEZ de repetir os 82 pares: repetir a lista criaria
-- duas fontes que divergem no primeiro ajuste de seed. Aqui, neste ponto da migration, a
-- tabela contém exatamente o que o bloco acima acabou de semear.
--
-- ⚠️ O `on conflict do nothing` faz isto capturar o estado da PRIMEIRA aplicação. Se esta
-- migration for reaplicada depois de alguém editar a matriz, o padrão NÃO é reescrito com a
-- matriz editada — que é o comportamento desejado: padrão é padrão.
-- ────────────────────────────────────────────────────────────

create table if not exists public.neo_role_permissions_default (
  role_id       text not null references public.neo_roles (id) on delete cascade,
  permission_id text not null references public.neo_permissions (id) on delete cascade,
  primary key (role_id, permission_id)
);

comment on table public.neo_role_permissions_default is
  'A matriz semente, congelada na primeira aplicação da migration. Só leitura pela aplicação: '
  'é o "restaurar padrão" da tela de papéis × funções. Mudar o padrão é migration.';

insert into public.neo_role_permissions_default (role_id, permission_id)
  select role_id, permission_id from public.neo_role_permissions
on conflict (role_id, permission_id) do nothing;

alter table public.neo_role_permissions_default enable row level security;

-- Leitura para qualquer pessoa autenticada (o catálogo e a matriz também são legíveis): saber
-- qual era o padrão não concede nada. ESCRITA não tem policy — nem para admin_geral. O padrão
-- muda por migration, senão "restaurar padrão" vira "restaurar o que o último editou".
drop policy if exists neo_role_permissions_default_read on public.neo_role_permissions_default;
create policy neo_role_permissions_default_read on public.neo_role_permissions_default
  for select to authenticated using (true);

-- ────────────────────────────────────────────────────────────
-- 6. portal_roles: `admin` passa a significar Admin Geral
--
-- ⚠️ ORDEM OBRIGATÓRIA — os três passos abaixo NÃO podem ser reordenados:
--
--   (a) derrubar o CHECK antigo. Ele é `role in ('admin','am')` e recusa 'admin_geral';
--       o update do passo (c) morreria com 23514 e a migration inteira abortaria.
--   (b) redefinir `protect_last_admin` para 'admin_geral' ANTES do update. O trigger antigo
--       lê o rename como "old.role='admin' and new.role<>'admin'", conta zero admins
--       restantes e ABORTA. A migration se trancaria fora por causa da própria guarda que
--       ela quer preservar.
--   (c) só então o update.
--
-- Quem é admin hoje vira Admin Geral: ninguém perde poder na virada. O papel `admin` novo
-- nasce SEM NINGUÉM — conceder é decisão de quem administra, não desta migration.
-- ────────────────────────────────────────────────────────────

-- (a)
alter table public.portal_roles drop constraint if exists portal_roles_role_check;

-- (b)
create or replace function public.protect_last_admin() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_restantes int;
begin
  if (tg_op = 'DELETE' and old.role = 'admin_geral')
     or (tg_op = 'UPDATE' and old.role = 'admin_geral' and new.role <> 'admin_geral') then
    select count(*) into v_restantes
      from public.portal_roles
     where role = 'admin_geral'
       and revoked_at is null
       and email <> old.email;
    if v_restantes = 0 then
      raise exception
        'não é possível remover o último Admin Geral do portal (%). Conceda Admin Geral a outra pessoa antes.',
        old.email;
    end if;
  end if;
  return coalesce(new, old);
end $$;

-- (c) — GATED, e o gate é load-bearing.
--
-- ⚠️ ESTE UPDATE NÃO PODE RODAR DUAS VEZES. Depois desta migration, `admin` é um papel
-- VÁLIDO e diferente (o Admin operacional). Uma reaplicação sem gate promoveria todo Admin
-- legítimo a Admin Geral — corrupção silenciosa de dado, e justamente na tabela que decide
-- quem manda. Achado ao rodar o teste de idempotência, não na revisão.
--
-- O marcador é a FK: ela só existe depois da primeira aplicação. Os dois passos ficam no
-- mesmo bloco para não haver como aplicar um sem o outro.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'portal_roles_role_fkey') then
    update public.portal_roles set role = 'admin_geral' where role = 'admin';

    -- Agora o papel é chave estrangeira, não string solta.
    alter table public.portal_roles
      add constraint portal_roles_role_fkey foreign key (role) references public.neo_roles(id);
  end if;
end $$;

-- FK não sabe filtrar por escopo, então o escopo vira trigger: conceder 'sm' globalmente em
-- portal_roles daria a alguém o papel de squad em TODOS os squads de uma vez.
create or replace function public.validate_portal_role_scope() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_scope text;
  v_grantable boolean;
begin
  select scope, grantable into v_scope, v_grantable
    from public.neo_roles where id = new.role;
  if v_scope <> 'global' then
    raise exception 'o papel "%" é de squad — conceda-o em squad_members, não em portal_roles', new.role;
  end if;
  if not v_grantable then
    raise exception 'o papel "%" é implícito e não pode ser concedido a ninguém', new.role;
  end if;
  return new;
end $$;

drop trigger if exists validate_portal_role_scope_trg on public.portal_roles;
create trigger validate_portal_role_scope_trg
  before insert or update of role on public.portal_roles
  for each row execute function public.validate_portal_role_scope();

-- `squad_members.role` NÃO ganha FK de propósito. O CHECK `role in ('sm','member')` é o que
-- torna a escalação SM→AM estruturalmente impossível (PAPEIS.md §4) — uma FK para neo_roles
-- aceitaria 'am' de volta, porque 'am' é um papel válido, só não ali. O CHECK fica.

-- ────────────────────────────────────────────────────────────
-- 7. O predicado único
-- ────────────────────────────────────────────────────────────

create or replace function public.has_perm(p_perm text, p_team uuid default null)
returns boolean
language sql stable security definer set search_path = public as $$
  select
    -- (a) papel GLOBAL concedido e não revogado → vale em qualquer squad
    exists (
      select 1
        from public.portal_roles pr
        join public.neo_role_permissions rp on rp.role_id = pr.role
       where pr.email = lower(auth.jwt() ->> 'email')
         and pr.revoked_at is null
         and rp.permission_id = p_perm
    )
    -- (b) papel implícito `todos`: toda pessoa com acesso ao NEO
    or (
      public.is_neo_allowed()
      and exists (
        select 1 from public.neo_role_permissions
         where role_id = 'todos' and permission_id = p_perm
      )
    )
    -- (c) papel de SQUAD, só quando a pergunta é sobre um squad concreto
    or (
      p_team is not null
      and exists (
        select 1
          from public.squad_members sm
          join public.neo_role_permissions rp on rp.role_id = sm.role
         where sm.user_id = auth.uid()
           and sm.team_id = p_team
           and rp.permission_id = p_perm
      )
    );
$$;

comment on function public.has_perm(text, uuid) is
  'O predicado de autorização do NEO. Concede por papel global (vale em todos os squads), '
  'pelo papel implícito `todos`, ou por papel de squad no squad informado. Papel revogado '
  'não conta. Passar p_team = null pergunta apenas pela autoridade global.';

/**
 * Existe alguma permissão de um prefixo? Usada onde a POLICY só precisa saber "esta pessoa
 * tem algum papel no ciclo?" e quem decide a transição específica é o trigger da jornada.
 *
 * Sem isto, `cycles_update` teria de repetir seis `has_perm(...)` em OR — e cada permissão
 * nova de ciclo exigiria lembrar de acrescentá-la lá.
 */
create or replace function public.has_perm_prefix(p_prefix text, p_team uuid default null)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.portal_roles pr
      join public.neo_role_permissions rp on rp.role_id = pr.role
     where pr.email = lower(auth.jwt() ->> 'email')
       and pr.revoked_at is null
       and rp.permission_id like p_prefix || '%'
  ) or (
    public.is_neo_allowed()
    and exists (
      select 1 from public.neo_role_permissions
       where role_id = 'todos' and permission_id like p_prefix || '%'
    )
  ) or (
    p_team is not null
    and exists (
      select 1
        from public.squad_members sm
        join public.neo_role_permissions rp on rp.role_id = sm.role
       where sm.user_id = auth.uid()
         and sm.team_id = p_team
         and rp.permission_id like p_prefix || '%'
    )
  );
$$;

-- Permissões GLOBAIS da pessoa, para o front decidir o que mostrar e para as claims do
-- cookie de sessão. Não inclui as de squad: essas dependem de qual squad, e a UI as pergunta
-- por squad.
create or replace function public.my_permissions() returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array(
    select distinct rp.permission_id
      from public.neo_role_permissions rp
     where rp.role_id in (
             select pr.role from public.portal_roles pr
              where pr.email = lower(auth.jwt() ->> 'email') and pr.revoked_at is null
           )
        or (rp.role_id = 'todos' and public.is_neo_allowed())
     order by rp.permission_id
  ), '{}'::text[]);
$$;

-- Um RPC só para o `/api/session` assar as claims: papéis + permissões numa ida.
create or replace function public.my_neo_claims()
returns table (roles text[], perms text[])
language sql stable security definer set search_path = public as $$
  select public.my_portal_roles(), public.my_permissions();
$$;

-- Permissões da pessoa DENTRO de um squad (as de papel de squad somadas às globais).
create or replace function public.my_squad_permissions(p_team uuid) returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array(
    select distinct rp.permission_id
      from public.neo_role_permissions rp
     where rp.role_id in (
             select pr.role from public.portal_roles pr
              where pr.email = lower(auth.jwt() ->> 'email') and pr.revoked_at is null
             union all
             select sm.role from public.squad_members sm
              where sm.user_id = auth.uid() and sm.team_id = p_team
           )
        or (rp.role_id = 'todos' and public.is_neo_allowed())
     order by rp.permission_id
  ), '{}'::text[]);
$$;

-- OS DOIS REVOKES SÃO NECESSÁRIOS EM CADA FUNÇÃO. O bootstrap do Supabase roda
-- `grant all on all routines in schema public to anon, authenticated, service_role`, que é um
-- grant EXPLÍCITO ao papel `anon` — `revoke ... from public` NÃO o alcança. Está documentado
-- em 20260727130000 e eu errei aqui na primeira escrita; quem pegou foi a asserção
-- "papel anon não tem EXECUTE" em tests/pg/rls-local.ts.
--
-- `is_neo_allowed` e `is_neo_email_allowed` seguem acessíveis a `anon` DE PROPÓSITO: o hub as
-- chama antes do login para decidir quem pode receber o código de acesso.
revoke all on function public.has_perm(text, uuid) from public, anon;
revoke all on function public.has_perm_prefix(text, uuid) from public, anon;
revoke all on function public.my_permissions() from public, anon;
revoke all on function public.my_neo_claims() from public, anon;
revoke all on function public.my_squad_permissions(uuid) from public, anon;
grant execute on function public.has_perm(text, uuid) to authenticated;
grant execute on function public.has_perm_prefix(text, uuid) to authenticated;
grant execute on function public.my_permissions() to authenticated;
grant execute on function public.my_neo_claims() to authenticated;
grant execute on function public.my_squad_permissions(uuid) to authenticated;

-- ────────────────────────────────────────────────────────────
-- 8. Índices
--
-- has_perm() roda DENTRO de RLS e pode ser chamada por linha. `stable` deixa o planner
-- cachear por statement com os mesmos argumentos; os índices cobrem o resto.
-- ────────────────────────────────────────────────────────────

create index if not exists portal_roles_email_ativo_idx
  on public.portal_roles (email) where revoked_at is null;
create index if not exists squad_members_user_team_idx
  on public.squad_members (user_id, team_id);
create index if not exists neo_role_permissions_perm_idx
  on public.neo_role_permissions (permission_id);

-- ────────────────────────────────────────────────────────────
-- 9. RLS das tabelas novas
--
-- Catálogo e matriz são LEGÍVEIS por qualquer pessoa autenticada de propósito: a UI precisa
-- explicar o que cada papel pode fazer, e esconder o catálogo não protege nada — ele
-- descreve o sistema, não os dados. Escrita é outra história.
-- ────────────────────────────────────────────────────────────

alter table public.neo_roles                  enable row level security;
alter table public.neo_permissions            enable row level security;
alter table public.neo_role_permissions       enable row level security;
alter table public.neo_role_permissions_audit enable row level security;

drop policy if exists neo_roles_read on public.neo_roles;
create policy neo_roles_read on public.neo_roles for select to authenticated using (true);

drop policy if exists neo_permissions_read on public.neo_permissions;
create policy neo_permissions_read on public.neo_permissions for select to authenticated using (true);

drop policy if exists neo_role_permissions_read on public.neo_role_permissions;
create policy neo_role_permissions_read on public.neo_role_permissions for select to authenticated using (true);

drop policy if exists neo_role_permissions_write on public.neo_role_permissions;
create policy neo_role_permissions_write on public.neo_role_permissions for all to authenticated
  using (public.has_perm('neo.matrix.manage')) with check (public.has_perm('neo.matrix.manage'));

drop policy if exists neo_role_permissions_audit_read on public.neo_role_permissions_audit;
create policy neo_role_permissions_audit_read on public.neo_role_permissions_audit
  for select to authenticated using (public.has_perm('neo.audit.read'));

-- `neo_roles` e `neo_permissions` NÃO ganham policy de escrita: papel novo e permissão nova
-- são migration, porque mudam o significado do sistema. RLS ligada sem policy de escrita =
-- ninguém escreve direto, que é o desejado.
-- `neo_role_permissions_audit` também não: só o trigger escreve, e uma trilha que o autor
-- edita não é trilha.

-- ────────────────────────────────────────────────────────────
-- 10. AS POLICIES — de is_portal_*/is_sm/is_member para has_perm
--
-- 34 policies, uma por uma. O inventário que as levantou foi feito aplicando as migrations
-- num Postgres limpo e consultando `pg_policies`, e não lendo os 59 arquivos em ordem: é o
-- `drop policy if exists` da última migration que decide o que está no ar, e reconstruir isso
-- à mão é onde se perde uma.
-- ────────────────────────────────────────────────────────────

-- ── Leitura do squad e do que pende dele ──
-- `is_member(x) or is_portal_am()` vira UMA permissão. Quem a tem por papel de squad vê os
-- seus squads; quem a tem por papel global vê todos. A distinção local/global sai do
-- predicado e passa a ser "qual papel detém a permissão".

drop policy if exists teams_read on public.teams;
create policy teams_read on public.teams for select to authenticated
  using (public.has_perm('mma.squad.read', id));

drop policy if exists sqm_read on public.squad_members;
create policy sqm_read on public.squad_members for select to authenticated
  using (user_id = auth.uid() or public.has_perm('mma.squad.read', team_id));

drop policy if exists cycles_read on public.assessment_cycles;
create policy cycles_read on public.assessment_cycles for select to authenticated
  using (public.has_perm('mma.squad.read', team_id));

drop policy if exists read_readings on public.anchor_readings;
create policy read_readings on public.anchor_readings for select to authenticated
  using (public.has_perm('mma.squad.read', team_id));

drop policy if exists kz_read on public.kaizens;
create policy kz_read on public.kaizens for select to authenticated
  using (public.has_perm('mma.squad.read', team_id));

drop policy if exists prop_read on public.proposals;
create policy prop_read on public.proposals for select to authenticated
  using (exists (select 1 from public.assessment_cycles c
                  where c.id = cycle_id and public.has_perm('mma.squad.read', c.team_id)));

drop policy if exists presession_read on public.pre_session_assessments;
create policy presession_read on public.pre_session_assessments for select to authenticated
  using (exists (select 1 from public.assessment_cycles c
                  where c.id = cycle_id and public.has_perm('mma.squad.read', c.team_id)));

drop policy if exists homolog_read on public.homologations;
create policy homolog_read on public.homologations for select to authenticated
  using (exists (select 1 from public.assessment_cycles c
                  where c.id = cycle_id and public.has_perm('mma.squad.read', c.team_id)));

-- ── Escrita do ciclo ──
-- A policy é o gate GROSSO ("tem algum papel no ciclo deste squad?"); QUEM pode fazer cada
-- transição é o trigger da §11. `has_perm_prefix` evita repetir seis has_perm em OR e evita
-- que uma permissão de ciclo nova precise ser lembrada aqui.

drop policy if exists cycles_insert on public.assessment_cycles;
create policy cycles_insert on public.assessment_cycles for insert to authenticated
  with check (public.has_perm('mma.cycle.create', team_id));

drop policy if exists cycles_update on public.assessment_cycles;
create policy cycles_update on public.assessment_cycles for update to authenticated
  using (public.has_perm_prefix('mma.cycle.', team_id))
  with check (status <> 'official');

drop policy if exists presession_write on public.pre_session_assessments;
create policy presession_write on public.pre_session_assessments for all to authenticated
  using (exists (select 1 from public.assessment_cycles c
                  where c.id = cycle_id
                    and public.has_perm('mma.cycle.presession', c.team_id)
                    and c.status = 'pre_session'))
  with check (exists (select 1 from public.assessment_cycles c
                  where c.id = cycle_id
                    and public.has_perm('mma.cycle.presession', c.team_id)
                    and c.status = 'pre_session'));

drop policy if exists prop_write on public.proposals;
create policy prop_write on public.proposals for all to authenticated
  using (exists (select 1 from public.assessment_cycles c
                  where c.id = cycle_id
                    and public.has_perm('mma.cycle.session', c.team_id)
                    and c.status = 'session'))
  with check (exists (select 1 from public.assessment_cycles c
                  where c.id = cycle_id
                    and public.has_perm('mma.cycle.session', c.team_id)
                    and c.status = 'session'));

-- `am_user_id = auth.uid()` FICA: quem homologa assina a própria homologação.
drop policy if exists homolog_write on public.homologations;
create policy homolog_write on public.homologations for insert to authenticated
  with check (
    am_user_id = auth.uid()
    and exists (select 1 from public.assessment_cycles c
                 where c.id = cycle_id
                   and public.has_perm('mma.cycle.homologate', c.team_id)
                   and c.status = 'homologation')
  );

-- UPDATE por PAPEL, não por posse — a correção de 20260727150000 é preservada: outro AM
-- edita a homologação de um colega, e o `upsert` do front (que faz UPDATE na 2ª edição)
-- continua funcionando.
drop policy if exists homolog_update on public.homologations;
create policy homolog_update on public.homologations for update to authenticated
  using (exists (select 1 from public.assessment_cycles c
                  where c.id = cycle_id
                    and public.has_perm('mma.cycle.homologate', c.team_id)
                    and c.status = 'homologation'))
  with check (exists (select 1 from public.assessment_cycles c
                  where c.id = cycle_id
                    and public.has_perm('mma.cycle.homologate', c.team_id)
                    and c.status = 'homologation'));

-- ── Kaizens: criar/editar é do time, excluir é governado ──
drop policy if exists kz_insert on public.kaizens;
create policy kz_insert on public.kaizens for insert to authenticated
  with check (public.has_perm('mma.kaizen.write', team_id));

drop policy if exists kz_update on public.kaizens;
create policy kz_update on public.kaizens for update to authenticated
  using (public.has_perm('mma.kaizen.write', team_id))
  with check (public.has_perm('mma.kaizen.write', team_id));

drop policy if exists kz_delete on public.kaizens;
create policy kz_delete on public.kaizens for delete to authenticated
  using (public.has_perm('mma.kaizen.delete', team_id));

-- ── Estrutura da organização ──
drop policy if exists sqm_write on public.squad_members;
create policy sqm_write on public.squad_members for all to authenticated
  using (public.has_perm('mma.member.manage')) with check (public.has_perm('mma.member.manage'));

comment on policy sqm_write on public.squad_members is
  'Membros e papéis de squad. O papel `am` não existe nesta coluna (virou papel global), o que '
  'elimina a escalação SM→AM por construção em vez de por remendo.';

drop policy if exists teams_insert on public.teams;
create policy teams_insert on public.teams for insert to authenticated
  with check (public.has_perm('mma.squad.create'));

drop policy if exists teams_write on public.teams;
create policy teams_write on public.teams for update to authenticated
  using (public.has_perm('mma.squad.update')) with check (public.has_perm('mma.squad.update'));

-- ── Conteúdo do modelo (a régua com que todos são avaliados) ──
drop policy if exists content_write_axes on public.axes;
create policy content_write_axes on public.axes for all to authenticated
  using (public.has_perm('mma.content.edit')) with check (public.has_perm('mma.content.edit'));

drop policy if exists content_write_dims on public.dimensions;
create policy content_write_dims on public.dimensions for all to authenticated
  using (public.has_perm('mma.content.edit')) with check (public.has_perm('mma.content.edit'));

drop policy if exists content_write_stages on public.stages;
create policy content_write_stages on public.stages for all to authenticated
  using (public.has_perm('mma.content.edit')) with check (public.has_perm('mma.content.edit'));

drop policy if exists content_write_anchor on public.anchors;
create policy content_write_anchor on public.anchors for all to authenticated
  using (public.has_perm('mma.content.edit')) with check (public.has_perm('mma.content.edit'));

drop policy if exists content_write_dsd on public.dimension_stage_descriptions;
create policy content_write_dsd on public.dimension_stage_descriptions for all to authenticated
  using (public.has_perm('mma.content.edit')) with check (public.has_perm('mma.content.edit'));

-- ── Pessoas ──
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.has_perm('neo.people.read_all') or public.shares_squad_with(id));

drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles for update to authenticated
  using (public.has_perm('neo.people.edit_any')) with check (public.has_perm('neo.people.edit_any'));

-- ── Governança ──
drop policy if exists portal_roles_read on public.portal_roles;
create policy portal_roles_read on public.portal_roles for select to authenticated
  using (email = lower(auth.jwt() ->> 'email') or public.has_perm('neo.roles.manage'));

drop policy if exists portal_roles_write on public.portal_roles;
create policy portal_roles_write on public.portal_roles for all to authenticated
  using (public.has_perm('neo.roles.manage')) with check (public.has_perm('neo.roles.manage'));

drop policy if exists destructive_audit_read on public.destructive_audit;
create policy destructive_audit_read on public.destructive_audit for select to authenticated
  using (public.has_perm('neo.audit.read'));

-- ── A allowlist do NEO ganha escrita ──
-- Até aqui `neo_access` só tinha policy de SELECT: gerenciar exceções exigia o dashboard do
-- Supabase. Com o app de administração isso passa a ser tarefa de produto.
drop policy if exists neo_access_write on public.neo_access;
create policy neo_access_write on public.neo_access for all to authenticated
  using (public.has_perm('neo.access.manage')) with check (public.has_perm('neo.access.manage'));

-- A leitura continua sendo "quem já tem acesso": ela NÃO pode depender de papel, porque é a
-- própria lista que decide quem tem acesso.
drop policy if exists "neo_access readable by allowed" on public.neo_access;
-- O drop do PRÓPRIO nome é o que torna a migration reaplicável. 20260726120000 registra ter
-- esquecido exatamente isto e morrido em "policy already exists" na segunda aplicação; este
-- arquivo repetiu o erro e o teste de idempotência o pegou de novo.
drop policy if exists neo_access_read on public.neo_access;
create policy neo_access_read on public.neo_access for select to authenticated
  using (public.is_neo_allowed());

-- ────────────────────────────────────────────────────────────
-- 10b. A camada LEGADA deixa de ser caminho de autoridade
--
-- Achado ao levantar o inventário: `can_access_team()` chama `is_admin()`, que lê a tabela
-- LEGADA `user_roles` — e as policies de `assessments`, `assessment_answers`,
-- `assessment_theme_scores` e `custom_kaizens` chamam `can_access_team`/`can_access_assessment`.
-- Ou seja: uma linha esquecida em `user_roles` dava ESCRITA nessas tabelas.
--
-- É a mesma família que 20260726120000 §6c fechou em `profiles` ("Admins can update any
-- profile" dependia de `is_admin`) e deixou aberta aqui, por ter olhado só `profiles`.
--
-- As quatro tabelas estão MORTAS: zero referências em `src/` (verificado — aparecem apenas no
-- `types.ts` gerado). Fechar não tem risco funcional justamente porque nada as lê. Mesma
-- decisão do §6b daquela migration: as tabelas FICAM (drop é irreversível e desnecessário),
-- só a permissão sai. `is_admin`, `can_access_team`, `can_access_assessment` e `is_approved`
-- ficam órfãs — deixam de ser alcançáveis por qualquer policy.
-- ────────────────────────────────────────────────────────────

do $$
declare
  v_table text;
  v_policy text;
begin
  foreach v_table in array array['assessments','assessment_answers','assessment_theme_scores','custom_kaizens'] loop
    if to_regclass('public.' || v_table) is null then continue; end if;
    for v_policy in
      select policyname from pg_policies where schemaname = 'public' and tablename = v_table
    loop
      execute format('drop policy %I on public.%I', v_policy, v_table);
    end loop;
    execute format(
      'create policy legacy_read on public.%I for select to authenticated using (true)', v_table);
    execute format(
      'create policy legacy_write on public.%I for all to authenticated '
      'using (public.has_perm(''mma.content.edit'')) with check (public.has_perm(''mma.content.edit''))',
      v_table);
  end loop;
end $$;

-- `user_roles` é tabela de PAPEL: seu lugar é atrás de quem governa acesso, e a leitura
-- também fecha — `legacy_read using (true)` num diretório de papéis seria vazamento sem
-- finalidade, ainda que de dado morto.
do $$
declare v_policy text;
begin
  if to_regclass('public.user_roles') is null then return; end if;
  for v_policy in
    select policyname from pg_policies where schemaname = 'public' and tablename = 'user_roles'
  loop
    execute format('drop policy %I on public.user_roles', v_policy);
  end loop;
  create policy legacy_read on public.user_roles for select to authenticated
    using (public.has_perm('neo.roles.manage'));
  create policy legacy_write on public.user_roles for all to authenticated
    using (public.has_perm('neo.roles.manage')) with check (public.has_perm('neo.roles.manage'));
end $$;

-- As 4 tabelas legadas de conteúdo (themes/levels/questions/theme_level_descriptions) já
-- tinham legacy_read/legacy_write de 20260726120000 §6b, apontando para is_portal_admin().
-- Repontar para a permissão de conteúdo.
do $$
declare v_table text;
begin
  foreach v_table in array array['themes','levels','questions','theme_level_descriptions'] loop
    if to_regclass('public.' || v_table) is null then continue; end if;
    execute format('drop policy if exists legacy_write on public.%I', v_table);
    execute format(
      'create policy legacy_write on public.%I for all to authenticated '
      'using (public.has_perm(''mma.content.edit'')) with check (public.has_perm(''mma.content.edit''))',
      v_table);
  end loop;
end $$;

-- ────────────────────────────────────────────────────────────
-- 11. A jornada, agora em permissões
--
-- DECISÃO IMPORTANTE: o atalho `if is_portal_admin() then return new; end if` SAI.
--
-- Ele existia para dizer "admin faz tudo". Com a matriz editável, um bypass fixo em código
-- faria a matriz MENTIR: desligar `mma.cycle.archive` do Admin Geral na tela não teria efeito
-- nenhum, porque o atalho passaria antes. Admin e Admin Geral continuam podendo tudo — porque
-- a matriz semente lhes dá todas as permissões de ciclo, explicitamente, onde se pode ver e
-- auditar. Autoridade fica em dado, não em `if`.
--
-- O bypass do OPERADOR (`current_user not in ('authenticated','anon')`) FICA: sem ele um ciclo
-- travado num status errado seria irrecuperável — nem seed, nem script de manutenção, nem o
-- SQL editor o consertariam. Não é autorização de produto, é a saída de emergência.
-- ────────────────────────────────────────────────────────────

create or replace function public.enforce_cycle_transition() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.status = old.status then
    return new;
  end if;

  -- service_role, postgres e o SQL editor passam direto. Ver o comentário acima.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if new.status = 'pre_session' then
    -- Volta ao começo da jornada = reiniciar (é o restart_assessment).
    if not public.has_perm('mma.cycle.restart', new.team_id) then
      raise exception 'você não tem permissão para reiniciar o assessment deste squad';
    end if;

  elsif old.status = 'pre_session' and new.status = 'session' then
    if not public.has_perm('mma.cycle.session', new.team_id) then
      raise exception 'você não tem permissão para abrir a sessão deste squad';
    end if;

  elsif old.status = 'session' and new.status = 'homologation' then
    if not public.has_perm('mma.cycle.submit', new.team_id) then
      raise exception 'você não tem permissão para enviar este assessment para homologação';
    end if;

  elsif old.status = 'homologation' and new.status = 'session' then
    if not public.has_perm('mma.cycle.return', new.team_id) then
      raise exception 'você não tem permissão para devolver a homologação para a sessão';
    end if;

  elsif old.status = 'homologation' and new.status = 'official' then
    if not public.has_perm('mma.cycle.homologate', new.team_id) then
      raise exception 'você não tem permissão para oficializar este assessment';
    end if;

  elsif old.status = 'official' and new.status = 'archived' then
    if not public.has_perm('mma.cycle.archive', new.team_id) then
      raise exception 'você não tem permissão para arquivar este ciclo';
    end if;

  else
    raise exception 'transição de ciclo inválida: % → %', old.status, new.status;
  end if;

  return new;
end $$;

-- ────────────────────────────────────────────────────────────
-- 12. As funções de negócio
--
-- Só o PREDICADO muda em cada uma. Os corpos são preservados verbatim — a reescrita de
-- `officialize_cycle` em 26/07 apagou por descuido a geração de kaizens (a etapa "Plano"), e
-- é o tipo de perda que passa por revisão.
-- ────────────────────────────────────────────────────────────

create or replace function public.officialize_cycle(p_cycle uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_team uuid;
  v_dims int;
  v_homs int;
begin
  select team_id into v_team from assessment_cycles where id = p_cycle;
  if v_team is null then raise exception 'ciclo inexistente'; end if;
  if not public.has_perm('mma.cycle.homologate', v_team) then
    raise exception 'você não tem permissão para oficializar o assessment deste squad';
  end if;

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

  -- A GERAÇÃO DOS KAIZENS (etapa "Plano"). Preservada verbatim de 20260726120000.
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

create or replace function public.restart_assessment(p_team uuid, p_reason text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_cycle uuid;
  v_snapshot jsonb;
begin
  if not public.has_perm('mma.cycle.restart', p_team) then
    raise exception 'você não tem permissão para reiniciar o assessment deste squad';
  end if;

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'informe o motivo do reinício (p_reason) — a ação é destrutiva e auditada';
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

  select jsonb_build_object(
           'cycle',        (select to_jsonb(c) from assessment_cycles c where c.id = v_cycle),
           'proposals',    coalesce((select jsonb_agg(to_jsonb(p)) from proposals p where p.cycle_id = v_cycle), '[]'::jsonb),
           'homologations',coalesce((select jsonb_agg(to_jsonb(h)) from homologations h where h.cycle_id = v_cycle), '[]'::jsonb),
           'kaizens',      coalesce((select jsonb_agg(to_jsonb(k)) from kaizens k where k.cycle_id = v_cycle), '[]'::jsonb),
           'pre_session',  coalesce((select jsonb_agg(to_jsonb(s)) from pre_session_assessments s where s.cycle_id = v_cycle), '[]'::jsonb)
         )
    into v_snapshot;

  insert into public.destructive_audit (action, team_id, cycle_id, actor_email, actor_id, reason, snapshot)
  values ('restart_assessment', p_team, v_cycle,
          lower(auth.jwt() ->> 'email'), auth.uid(), btrim(p_reason), v_snapshot);

  delete from kaizens where cycle_id = v_cycle;
  delete from homologations where cycle_id = v_cycle;
  delete from proposals where cycle_id = v_cycle;
  delete from pre_session_assessments where cycle_id = v_cycle;

  update assessment_cycles
     set status = 'pre_session',
         workshop_at = null,
         officialized_at = null,
         homologated_by = null
   where id = v_cycle;

  return v_cycle;
end $$;

create or replace function public.delete_squad(p_team uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm('mma.squad.delete') then
    raise exception 'você não tem permissão para excluir squads';
  end if;

  if not exists (select 1 from teams where id = p_team) then
    raise exception 'squad inexistente';
  end if;

  delete from anchor_readings where team_id = p_team;
  delete from kaizens where team_id = p_team;
  delete from assessment_cycles where team_id = p_team;
  delete from teams where id = p_team;
end $$;

create or replace function public.find_profile_by_email(p_email text)
returns table (id uuid, email text, full_name text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_perm('mma.people.find') then
    raise exception 'você não tem permissão para buscar perfis por e-mail';
  end if;

  return query
    select p.id, p.email, p.full_name
      from profiles p
     where lower(p.email) = lower(trim(p_email))
     limit 1;
end $$;

create or replace function public.can_sync_anchors(p_team uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.has_perm('mma.anchor.sync', p_team), false);
$$;

-- Os revokes de `can_sync_anchors` são REAFIRMADOS aqui, embora `create or replace` preserve
-- privilégios em produção. O motivo é o harness: `grantSupabaseDefaults()` roda DEPOIS das
-- migrations no PGlite (em produção o bootstrap do Supabase roda ANTES), então o teste
-- reaplica uma migration para restaurar a ordem real. Antes, ele reaplicava
-- 20260727130000 — que recria esta função com o corpo ANTIGO, chamando is_sm(), removida
-- nesta migration. Carregando os revokes aqui, é ESTA migration que o teste reaplica, e o
-- estado restaurado é o atual em vez de um fóssil.
revoke all on function public.can_sync_anchors(uuid) from public, anon;
grant execute on function public.can_sync_anchors(uuid) to authenticated;
revoke all on function public.officialize_cycle(uuid) from public, anon;
grant execute on function public.officialize_cycle(uuid) to authenticated;
revoke all on function public.restart_assessment(uuid, text) from public, anon;
grant execute on function public.restart_assessment(uuid, text) to authenticated;
revoke all on function public.delete_squad(uuid) from public, anon;
grant execute on function public.delete_squad(uuid) to authenticated;
revoke all on function public.find_profile_by_email(text) from public, anon;
grant execute on function public.find_profile_by_email(text) to authenticated;

-- ────────────────────────────────────────────────────────────
-- 13. A guarda do caminho de administração
--
-- "Totalmente editável" inclui poder desligar a permissão que dá acesso à tela de
-- permissões. Esta é a ÚNICA trava, e é a mais permissiva possível: você PODE mover
-- `neo.roles.manage`/`neo.matrix.manage` de `admin_geral` para outro papel — só não pode
-- salvar um estado em que NINGUÉM ativo as detenha, porque desse estado não se volta pela
-- aplicação (só service_role no SQL editor).
--
-- Mesma natureza do `protect_last_admin`: integridade de DISPONIBILIDADE, não restrição de
-- permissão. Para remover: derrube os dois triggers `assert_admin_path_*`.
--
-- AFTER ... FOR EACH STATEMENT de propósito: a pergunta é sobre o estado FINAL da matriz, e
-- um trigger por linha responderia no meio da mudança.
-- ────────────────────────────────────────────────────────────

create or replace function public.assert_admin_path_reachable() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_orfas text;
begin
  select string_agg(p.perm, ', ') into v_orfas
    from (select unnest(array['neo.roles.manage', 'neo.matrix.manage']) as perm) p
   where not exists (
     select 1
       from public.portal_roles pr
       join public.neo_role_permissions rp on rp.role_id = pr.role
      where pr.revoked_at is null
        and rp.permission_id = p.perm
   );

  if v_orfas is not null then
    raise exception
      'esta mudança deixaria NINGUÉM capaz de administrar o acesso do NEO (%). Conceda a permissão a outro papel, ou o papel a outra pessoa, antes.',
      v_orfas;
  end if;
  return null;
end $$;

drop trigger if exists assert_admin_path_matrix_trg on public.neo_role_permissions;
create trigger assert_admin_path_matrix_trg
  after insert or update or delete on public.neo_role_permissions
  for each statement execute function public.assert_admin_path_reachable();

drop trigger if exists assert_admin_path_roles_trg on public.portal_roles;
create trigger assert_admin_path_roles_trg
  after insert or update or delete on public.portal_roles
  for each statement execute function public.assert_admin_path_reachable();

-- A trilha da matriz entra DEPOIS da semente: ligada antes, ela registraria as ~80 linhas
-- do seed como se alguém as tivesse ligado à mão, e a primeira página do histórico viria
-- cheia de ruído em vez de mudanças reais.
drop trigger if exists audit_role_permission_trg on public.neo_role_permissions;
create trigger audit_role_permission_trg
  after insert or delete on public.neo_role_permissions
  for each row execute function public.audit_role_permission();

-- ────────────────────────────────────────────────────────────
-- 14. O modelo antigo sai — e o drop É a prova de completude
--
-- `is_portal_admin`, `is_portal_am`, `is_sm` e `is_member` saem POR ÚLTIMO e de propósito:
-- enquanto existirem, uma policy nova pode voltar ao modelo antigo sem ninguém notar. O
-- Postgres RECUSA o drop se qualquer policy, função ou trigger ainda as referenciar — então
-- esta migration só chega ao `commit` se a §10–§12 ficou completa. É o mesmo truque com que
-- `is_am(uuid)` foi retirado em 27/07, e é o que transforma "acho que migrei tudo" em
-- verificação.
--
-- `shares_squad_with` FICA: é relação entre pessoas ("compartilhamos squad"), não autoridade,
-- e `profiles_read` continua usando-a legitimamente.
-- `my_portal_roles` FICA: a tela de administração mostra papéis, não só permissões.
-- ────────────────────────────────────────────────────────────

drop function if exists public.is_portal_admin();
drop function if exists public.is_portal_am();
drop function if exists public.is_sm(uuid);
drop function if exists public.is_member(uuid);

commit;
