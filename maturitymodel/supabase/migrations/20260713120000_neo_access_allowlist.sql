-- NEO — Allowlist de acesso ao hub e às aplicações.
--
-- Contexto: o login do NEO é feito por Magic Link (Supabase Auth, e-mail OTP) no hub.
-- Qualquer pessoa pode receber o link, mas o ACESSO é controlado por esta allowlist:
--   • Regra base: todo e-mail @lmmobilidade.com.br é liberado automaticamente.
--   • Exceções (convidados fora do domínio) são adicionadas manualmente em `neo_access`.
--
-- A verdade da autorização é a função `is_neo_allowed()`, consumida pelos três apps
-- (hub, Performance Dash e Portal MMA). Ela lê o e-mail do JWT do usuário autenticado.

create table if not exists public.neo_access (
  email      text primary key,
  approved   boolean not null default true,
  note       text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

comment on table public.neo_access is
  'Exceções da allowlist do NEO (fora do domínio @lmmobilidade.com.br). Gerenciada pelo AM via dashboard Supabase.';

alter table public.neo_access enable row level security;

-- Autorização central do NEO. SECURITY DEFINER para poder ler a allowlist mesmo sob RLS.
create or replace function public.is_neo_allowed()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    lower(auth.jwt() ->> 'email') like '%@lmmobilidade.com.br'
    or exists (
      select 1 from public.neo_access a
      where a.email = lower(auth.jwt() ->> 'email') and a.approved
    ),
    false
  );
$$;

comment on function public.is_neo_allowed() is
  'true se o usuário autenticado pode acessar o NEO: e-mail @lmmobilidade.com.br OU exceção aprovada em neo_access.';

grant execute on function public.is_neo_allowed() to authenticated, anon;

-- A tabela em si só é legível por quem já tem acesso (o fluxo usa a função acima, não a tabela).
-- Escrita/gerência fica a cargo do service_role (dashboard Supabase) — sem policy de escrita.
create policy "neo_access readable by allowed"
  on public.neo_access
  for select
  using (public.is_neo_allowed());
