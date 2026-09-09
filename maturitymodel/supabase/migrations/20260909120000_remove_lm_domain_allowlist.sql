-- ============================================================================
-- Fim da regra de domínio: a allowlist do NEO passa a ser a ÚNICA porta.
--
-- CONTEXTO: a LM Mobilidade não opera mais o NEO. O domínio `@lmmobilidade.com.br`,
-- que desde 20260713120000 liberava acesso automaticamente, deixa de significar
-- qualquer coisa — inclusive para os dois admins, que eram e-mails LM.
--
-- MODELO NOVO: não existe libertação implícita. Quem entra é quem está em
-- `neo_access` com `approved`. A tabela deixa de ser "lista de exceções" e passa a
-- ser a lista, ponto. `is_neo_allowed()` e `is_neo_email_allowed()` continuam sendo
-- a verdade consumida pelos três apps e pela borda — só perderam o atalho do domínio.
--
-- ⚠️ ORDEM LOAD-BEARING. Os passos abaixo NÃO podem ser reordenados:
--   1. o admin novo entra na allowlist e ganha `admin_geral` ENQUANTO o domínio
--      ainda vale — senão ele seria inserido já sem poder entrar;
--   2. só então o domínio cai;
--   3. só então os papéis LM são revogados.
-- Invertido, o passo 3 dispara `assert_admin_path_reachable` (nenhum papel não
-- revogado teria `neo.roles.manage`) e a transação inteira aborta — que é o trigger
-- fazendo exatamente o trabalho dele.
--
-- NOTA sobre `protect_last_admin`: ele NÃO cobre esta revogação. A guarda dispara em
-- DELETE ou em UPDATE que troca `role`; revogar mexe em `revoked_at` e deixa `role`
-- intacto, então a condição é falsa. Quem de fato protege a disponibilidade aqui é
-- `assert_admin_path_reachable` (statement-level, e lê `revoked_at is null`). O
-- comentário de `offboard_person` credita a guarda errada — o efeito líquido é o
-- mesmo, mas quem for mexer nisso depois merece saber qual das duas segura a ponte.
-- ============================================================================

begin;

-- ────────────────────────────────────────────────────────────
-- 1. A allowlist nova — ANTES de o domínio cair
-- ────────────────────────────────────────────────────────────

-- Sem isto, o passo 2 tranca todo mundo do lado de fora, o autor incluído.
--
-- Estes quatro e-mails são a operação do NEO a partir daqui. Papel é outra conversa:
-- só o primeiro recebe `admin_geral` abaixo; os demais entram com o papel implícito
-- `todos` e ganham o que precisarem pela tela de Administração.
insert into public.neo_access (email, approved, note)
values
  ('diegocaporusso@gmail.com',    true, 'Admin principal do NEO após a saída da LM Mobilidade (2026-09-09).'),
  ('carlinha4m@gmail.com',        true, 'Acesso concedido na transferência de operação (2026-09-09).'),
  ('tordiego@gmail.com',          true, 'Acesso concedido na transferência de operação (2026-09-09).'),
  ('elainemendes0978@gmail.com',  true, 'Acesso concedido na transferência de operação (2026-09-09).')
on conflict (email) do update
  set approved = true,
      note     = excluded.note;

-- `granted_by` explícito: numa migration `auth.jwt()` é nulo, e o trigger
-- `stamp_portal_role_grant` só preenche o que vier vazio. Sem isto a linha que decide
-- quem manda no portal nasceria sem procedência.
insert into public.portal_roles (email, role, note, granted_by)
values (
  'diegocaporusso@gmail.com',
  'admin_geral',
  'Sucede ext.diego.caporusso@lmmobilidade.com.br na transferência de operação.',
  'migration:20260909120000'
)
on conflict (email, role) do update
  set revoked_at    = null,
      revoked_by    = null,
      revoke_reason = null,
      note          = excluded.note;

-- ────────────────────────────────────────────────────────────
-- 2. O domínio deixa de significar acesso
-- ────────────────────────────────────────────────────────────

-- Pós-login: lê o e-mail do JWT. Agora só a allowlist responde.
create or replace function public.is_neo_allowed()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    exists (
      select 1 from public.neo_access a
      where a.email = lower(auth.jwt() ->> 'email') and a.approved
    ),
    false
  );
$$;

comment on function public.is_neo_allowed() is
  'true se o usuário autenticado está aprovado em neo_access. Não há mais liberação por domínio.';

-- Pré-login (sem sessão): decide quem pode RECEBER o código de acesso.
create or replace function public.is_neo_email_allowed(check_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    exists (
      select 1 from public.neo_access a
      where a.email = lower(check_email) and a.approved
    ),
    false
  );
$$;

comment on function public.is_neo_email_allowed(text) is
  'true se o e-mail informado está aprovado em neo_access. Checagem PRÉ-login, sem sessão.';

comment on table public.neo_access is
  'A allowlist do NEO: quem está aqui com approved=true entra, e mais ninguém. '
  'Gerenciada em Administração → Acesso (permissão neo.access.manage).';

-- ────────────────────────────────────────────────────────────
-- 3. A LM sai
-- ────────────────────────────────────────────────────────────

-- UPDATE, não DELETE — mesma razão de `offboard_person`: apagar a linha apagaria a
-- prova de que o acesso existiu, que é o que uma transferência de operação precisa
-- demonstrar depois.
update public.portal_roles
   set revoked_at    = now(),
       revoked_by    = 'migration:20260909120000',
       revoke_reason = 'Saída da LM Mobilidade — domínio @lmmobilidade.com.br desligado em 2026-09-09.'
 where email like '%@lmmobilidade.com.br'
   and revoked_at is null;

-- Defensivo: se algum e-mail LM tiver entrado em `neo_access` (a tela de Administração
-- recusava, mas o dashboard do Supabase não), o passo 2 sozinho o deixaria passar —
-- a allowlist virou a única porta, e ele está dentro dela.
update public.neo_access
   set approved = false,
       note     = coalesce(note || ' | ', '') ||
                  'Bloqueado na saída da LM Mobilidade (2026-09-09).'
 where email like '%@lmmobilidade.com.br'
   and approved;

commit;
