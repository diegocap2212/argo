# Portabilidade — o que prende o NEO ao Supabase e à Vercel

> **Para quem herda este sistema.** Escrito em 2026-07-31, quando ficou claro que o NEO pode
> mudar de hospedagem (Vercel → Azure) e de banco (Supabase → Postgres gerenciado). Este
> documento não é um plano de migração: é o **inventário honesto do acoplamento**, medido e não
> estimado, para que quem decidir migrar saiba o tamanho de cada peça antes de começar.
>
> Nada aqui é hipotético. Os números vieram de consultar o schema depois de aplicar todas as
> migrations; o comando que os reproduz está no fim.

---

## 0. ANTES DE TUDO: talvez não seja preciso migrar nada

O Supabase permite **transferir o projeto inteiro para outra organização**. Não é export/import:
é o mesmo projeto mudando de dono. Schema, dados, `auth.users`, Vault, Edge Functions, chaves —
tudo continua exatamente como está, **com as mesmas URLs e as mesmas credenciais**.

Isso importa mais do que parece, porque **elimina o risco de dado descrito na §3**: como
`auth.users` não é recriado, os UUIDs não mudam, e os vínculos de `squad_members` continuam
válidos. Nenhum SM perde os squads. É a diferença entre uma tarde e um projeto.

Dashboard → Project Settings → General → Transfer project.

### Requisitos, verificados na documentação oficial (2026-07-31)

| Condição | Situação aqui |
|---|---|
| Ser **owner da organização de origem** | conferir — hoje a org é `zwzadexqvdlxvratunom` |
| Quem recebe precisa ser **ao menos membro da org de destino** | a Venice precisa ter uma org Supabase |
| **Sem integração GitHub ativa** no projeto | conferir antes |
| **Sem project-scoped roles** apontando para o projeto (Team/Enterprise) | conferir antes |
| **Sem log drains** configurados | conferir antes |

### O que a transferência NÃO faz

- **Não muda de região.** O projeto está em `sa-east-1` e continua lá. Se o requisito for dado
  em outra região, transferência não resolve — aí é migração de verdade (§1 em diante).
- **Não leva a Vercel junto.** Os dois projetos (`neo-lm` e `nero-portal`) são handover
  separado, pelo dashboard da Vercel.
- **Não leva o banco do Nero.** Ele é Neon, não Supabase — transferência própria.
- **Cuidado com o plano de destino:** ir de plano pago para Free pode causar **1–2 minutos de
  indisponibilidade**, perder features e esbarrar no teto de 2 projetos do Free.
- A cobrança é dividida pela data: a org de origem paga até a transferência, a de destino
  depois.

### Como escolher

| Se o requisito é… | Caminho |
|---|---|
| "a Venice assume a operação" | **transferir o projeto** — horas, risco baixo |
| "o dado tem de sair do Supabase / ir para a Azure" | migração de verdade — o resto deste documento |
| "por ora transferir, depois avaliar" | transferir agora; este documento continua válido para depois |

O resto deste documento trata do segundo caso. Se o primeiro resolver, **não leia adiante** —
migrar por escolha estética é trocar um sistema que funciona por um projeto de meses.

---

## A manchete

**O schema é Postgres puro, e isso é prova, não opinião.**

`corepack pnpm --filter maturitymodel test:migrations` aplica as **60 migrations** em ordem num
**PGlite** — Postgres compilado em WASM, sem Docker, sem nuvem, sem Supabase — e depois verifica
o schema resultante. Ele passa. O que o Supabase acrescenta está emulado num shim de ~90 linhas
em [`maturitymodel/tests/pg/supabase-shim.ts`](maturitymodel/tests/pg/supabase-shim.ts), e **esse
shim é o inventário completo da dependência de banco**:

| O que o shim emula | Por que existe |
|---|---|
| `auth.uid()`, `auth.jwt()`, `auth.role()` | as policies precisam saber quem está pedindo |
| `auth.users` (id, email, metadata) | `profiles` referencia; algumas views fazem join |
| papéis `anon`, `authenticated`, `service_role` | a RLS se aplica a `authenticated` |
| `vault.decrypted_secrets` | segredos lidos por `security definer` |

Se um dia isso rodar em Azure Database for PostgreSQL, **essas quatro coisas são a lista de
tarefas do banco**. Não há mais nada de Supabase no schema.

### O RBAC melhorou isso por acidente

Estado final medido: **32 tabelas · 31 funções · 62 policies** no schema `public`.

| | Quantas tocam `auth.*` direto |
|---|---|
| policies | **5** de 62 |
| funções | 15 de 31 |

Antes do RBAC de 31/07, cada policy lia o JWT por conta própria. Como agora quase todas chamam
`has_perm(permissao, squad)`, **57 das 62 policies não sabem que o Supabase existe**. Trocar o
provedor de identidade virou um problema de ~15 funções, não de 62 policies.

As 5 policies que restaram (para quem for fazer o corte):

```
homologations.homolog_write        profiles."Users can update their own profile"
portal_roles.portal_roles_read     profiles.profiles_read
squad_members.sqm_read
```

As 15 funções: `audit_role_permission`, `can_access_team`, `has_perm`, `has_perm_prefix`,
`is_neo_allowed`, `my_permissions`, `my_portal_roles`, `my_squad_permissions`,
`neo_perms_for_email`, `offboard_person`, `officialize_cycle`, `reconcile_portal_role_user`,
`restart_assessment`, `shares_squad_with`, `stamp_portal_role_grant`.

---

## 1. O que prende ao SUPABASE

Em ordem de dor para sair, não de tamanho.

### 1.1 PostgREST — a maior, e a menos óbvia

**O browser fala DIRETO com o banco.** Não existe camada de API própria: os apps chamam
`https://<projeto>.supabase.co/rest/v1/<tabela>` e a segurança é a **RLS** aplicada ao JWT do
usuário. Isso é o que permite o portal inteiro ter tão pouco backend.

Numa Azure sem Supabase, ou:

- **sobe-se o PostgREST** (open source, imagem Docker, roda em Container Apps) apontando para o
  Postgres novo — o front continua igual, e a RLS continua sendo o enforcement; ou
- **escreve-se uma API** e reescreve-se toda a camada de dados dos apps.

A primeira opção preserva o desenho e é ordens de magnitude mais barata. A segunda é um projeto.
Quem decidir isso está decidindo a arquitetura do sistema, não a hospedagem.

> ⚠️ Se escolherem a API própria: a RLS deixa de ser o enforcement automático e **cada rota passa
> a ter de repetir a autorização**. É exatamente o modo de falha que este repo passou 2026-07 a
> eliminar. Se for esse o caminho, `has_perm()` continua sendo o predicado — chame-o da API.

### 1.2 Autenticação (GoTrue)

Login por OTP de e-mail, `auth.users`, e os claims que `auth.uid()`/`auth.jwt()` expõem.

Na Azure o equivalente natural é **Entra ID** (ou Azure AD B2C). O trabalho:

1. emitir um JWT com `sub` e `email` nos mesmos lugares;
2. configurar o Postgres/PostgREST para ler esse JWT;
3. reescrever as 15 funções e 5 policies listadas acima.

**Atalho que vale a pena antes de migrar:** criar `neo_current_email()` e `neo_current_user_id()`
e trocar todo `auth.jwt() ->> 'email'` / `auth.uid()` por elas. A partir daí, mudar de provedor é
reescrever **duas** funções. Não foi feito em 31/07 de propósito — re-tocaria 15 funções na
véspera de um deploy, por um benefício que só aparece se a migração acontecer. É a primeira coisa
a fazer se ela for decidida.

### 1.3 Vault (`vault.decrypted_secrets`)

Dois consumidores: o cron das âncoras (`anchor_sync_url`, `anchor_sync_secret`) e o
`/api/authz` (`neo_authz_secret`). Equivalente: **Azure Key Vault** — mas atenção, o padrão aqui
é o SQL ler o segredo de dentro de uma função `security definer`. Com Key Vault isso vira uma
chamada de fora do banco, então **o desenho muda**: quem lê o segredo passa a ser a aplicação, e
a função recebe o segredo como argumento (que já é o caso de `neo_perms_for_email`).

### 1.4 `pg_cron` + `pg_net`

Um job diário que chama a Edge Function de sync das âncoras. Azure: Functions com timer trigger,
ou Logic Apps. Simples — é um POST agendado.

### 1.5 Edge Functions (Deno)

Três: `sync-anchors`, `sync-anchors-user`, `sync-anchors-cron` (mais `_shared`). São o único
ponto de contato com o Jira para as âncoras do MMA. Equivalente: **Azure Functions**. O código é
TypeScript com `fetch` — a portabilidade real é média, o que muda é o runtime e o modelo de
secrets.

---

## 2. O que prende à VERCEL

| Peça | O que é | Equivalente na Azure |
|---|---|---|
| `middleware.ts` | Edge Middleware: barra as rotas na borda e confere a permissão da porta | Front Door / App Gateway com rules, **ou** mover o gate para o servidor da app |
| `api/*.ts` (5) | `authz`, `comments`, `data`, `gate`, `session` — funções serverless | Azure Functions |
| `vercel.json` rewrites | compõe `/`, `/dash`, `/maturity`, `/admin` numa origem + rewrite do `/nero` | Static Web Apps routes, ou Front Door |
| `@vercel/blob` | dataset do Jira (~5 MB), privado | Azure Blob Storage |
| `@upstash/redis` | comentários do Dash + rate-limit do gate | Azure Cache for Redis |
| `nero-portal` (Next 16) | projeto Vercel separado | App Service / Container Apps |

**O que é fácil:** os quatro apps de `/`, `/dash`, `/maturity` e `/admin` são **builds estáticos
de Vite**. Qualquer hospedagem de arquivo estático serve. `@neo/auth` usa só Web Crypto, então
roda em Node, Deno, Edge ou browser sem mudança.

**O que é chato:** o middleware. Ele hoje é a única coisa entre um usuário sem sessão e o HTML
das apps. Se a hospedagem nova não tiver um equivalente na borda, esse gate precisa mudar de
lugar — e enquanto ele não existir, **as apps ficam servindo HTML para qualquer um** (o dado
continua protegido pela RLS, mas a superfície abre).

---

## 3. O DADO — o que sobrevive e o que quebra

Esta é a parte que causa perda silenciosa. Leia antes de exportar qualquer coisa.

### ✅ Sobrevive: `portal_roles`

É chaveada por **e-mail**, não por `user_id`. Papéis globais (AM, Admin, Admin Geral), com todo
o rastro de quem concedeu, quando, quem revogou e por quê, atravessam uma troca de provedor de
identidade **intactos**. Foi sorte de desenho — a chave é e-mail porque era preciso conceder
acesso a quem ainda não tinha feito login.

### ❌ QUEBRA: `squad_members` — **exceto se você transferir o projeto (§0)**

> Numa **transferência de projeto** no Supabase nada disto acontece: `auth.users` não é
> recriado, os UUIDs permanecem e os vínculos continuam válidos. O que segue vale para a
> migração de verdade — banco novo, autenticação nova.


É chaveada por `user_id` → `profiles.id` → `auth.users.id`. **Autenticação nova = UUIDs novos =
todos os vínculos SM↔time e member↔time apontam para o nada.**

Consequência concreta, porque é o que a RLS usa: depois da migração, **todo SM abre o MMA e não
vê squad nenhum**, e ninguém recebe erro — a lista simplesmente vem vazia.

**A defesa é exportar por e-mail, não por id.** Este é o SQL a rodar no Supabase ANTES de
qualquer migração.

> As quatro consultas foram **executadas contra o schema real** (PGlite com as 60 migrations
> aplicadas) em 2026-07-31, então os nomes de coluna estão corretos. Se alguém alterar as
> tabelas depois disto, reconfira antes de confiar — é SQL que se roda sob pressão.

```sql
-- Vínculos de squad, independentes de autenticação.
-- Reimportar resolvendo o e-mail para o user_id NOVO do provedor novo.
select t.name  as squad,
       p.email as pessoa,
       sm.role as papel
  from squad_members sm
  join profiles p on p.id = sm.user_id
  join teams    t on t.id = sm.team_id
 order by t.name, p.email;

-- Papéis globais (já são por e-mail — exportar como está).
select email, role, granted_by, created_at, revoked_at, revoked_by, revoke_reason
  from portal_roles
 order by email, role;

-- A matriz papel × função, que é dado editável e NÃO está em migration nenhuma
-- depois que alguém a editar pela tela.
select role_id, permission_id from neo_role_permissions order by 1, 2;

-- A allowlist de quem entra no NEO.
select email, approved, note from neo_access order by email;
```

> ⚠️ **A matriz é dado, não código.** `neo_role_permissions` nasce da semente da migration, mas
> a partir do primeiro clique na tela de administração ela diverge do arquivo. Migrar só as
> migrations e esquecer esta tabela devolve o sistema ao padrão de fábrica — sem erro, sem aviso,
> e com as permissões erradas.

### Também atenção

- `profiles.full_name` foi gravado UMA vez por trigger e, para quem entrou por OTP, **é o próprio
  e-mail**. Se corrigiram os nomes pela tela de administração, esse dado só existe em `profiles`
  e precisa ser exportado.
- `destructive_audit` e `neo_role_permissions_audit` são append-only e referenciam e-mail —
  sobrevivem. Levem junto: é a trilha de auditoria.
- Os dados do **Nero** ficam em outro banco (Neon, via Prisma) e têm migrations próprias em
  `nero-portal/prisma/migrations/`. Migração independente desta.

---

## 4. Ordem sugerida, se a migração acontecer

1. **Antes de mais nada:** o atalho da §1.2 (`neo_current_email`/`neo_current_user_id`), com
   `test:migrations` e `test:rls-local` verdes. Duas funções em vez de vinte depois.
2. Exportar os dados da §3 **por e-mail**.
3. Subir Postgres na Azure e aplicar as 60 migrations em ordem. **`test:migrations` é a
   ferramenta de ensaio** — ele já faz exatamente isso num Postgres limpo.
4. Subir PostgREST (ou decidir pela API própria — ver o aviso da §1.1).
5. Trocar o provedor de identidade e reimportar os vínculos resolvendo e-mail → id novo.
6. Rodar `test:rls-local` contra o banco novo. As 145 asserções de permissão são o critério de
   aceite: se elas passam, a autorização sobreviveu à mudança.
7. Só então mover a hospedagem dos apps.

---

## 5. Como reproduzir os números deste documento

```bash
corepack pnpm --filter maturitymodel test:migrations   # as 60 migrations em Postgres puro
corepack pnpm --filter maturitymodel test:rls-local    # 145 asserções de autorização
```

E, para recontar o acoplamento a `auth.*` no schema final, num PGlite já com as migrations
aplicadas:

```sql
select count(*) from pg_policies where schemaname='public';

select tablename, policyname from pg_policies
 where schemaname='public'
   and (coalesce(qual,'')||coalesce(with_check,'')) ~ 'auth\.(uid|jwt)\(';

select distinct p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.prokind='f'
   and pg_get_functiondef(p.oid) ~ 'auth\.(uid|jwt)\(';
```

Se esses números crescerem com o tempo, a porta de saída está se fechando — e vale saber disso
antes de precisar dela.
