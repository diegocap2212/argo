# Redesenho de papéis — Portal MMA

> **STATUS: IMPLEMENTADO em 2026-07-15** — migration `20260715120000_portal_admins_scoped_roles.sql`
> aplicada em produção; front em `RequireManager`/`useIsPortalAdmin`/AdminMMA em dois modos.
> Decisões finais do Diego: restart/exclusão = só admin global; SM edita metadados do próprio squad;
> admins por E-MAIL de login = ext.diego.caporusso@ e ext.tiago.massaro@lmmobilidade.com.br (backup);
> diretório de profiles fechado (busca por e-mail exato via RPC `find_profile_by_email`).
> Bônus de segurança aplicado: views `v_*` com `security_invoker=true` (antes BYPASSAVAM a RLS).

## 1. Estado atual (mapa fiel — explorado em 2026-07-14)

### O problema central
Não existe admin global no schema. A autoridade é por-squad via `squad_members(role in team/po/tl/sm/am)`,
MAS a função `is_any_am()` (security definer, sem parâmetro de team) dá a **qualquer AM de qualquer squad**
poderes globais de leitura E escrita. Com novos SMs recebendo papel `am`/`sm`, hoje eles veriam e
administrariam tudo.

### Onde `is_any_am()` concede poder global hoje (`20260710120200_mma_rls_policies.sql`)
| Tabela/RPC | Operação global concedida |
|---|---|
| `axes/stages/dimensions/dimension_stage_descriptions/anchors` | escrita do conteúdo do modelo |
| `squad_members` | ler todos + adicionar/remover membro de QUALQUER squad |
| `teams` | ler todos + update |
| `assessment_cycles`, `proposals`, `homologations`, `anchor_readings`, `kaizens` | leitura cross-squad |
| RPC `restart_assessment(p_team)` | reiniciar avaliação de QUALQUER squad |
| RPC `delete_squad(p_team)` | **apagar QUALQUER squad** |

Já `officialize_cycle` usa `is_am(team)` (por-squad) — correto, manter.

### Outros achados relevantes
- **Policies legadas de `teams` coexistem** (OR permissivo): `owner_id=auth.uid()`, `is_public`, `is_admin()` legado (`20260617130000`, `20251113192839`). O INSERT de squad hoje passa pela legada. Precisam ser derrubadas/absorvidas.
- `profiles`: SELECT `using(true)` — diretório inteiro visível a qualquer logado.
- `user_roles`/`is_admin()`: mecanismo de admin LEGADO, marcado como legado mas ainda vivo em policies antigas.
- Front: `RequireAM` = "AM em qualquer squad" (guarda só `/admin`); `Torre`/`useTeamLevels`/`useVisibleTeams` delegam o escopo 100% à RLS ("membro vê os seus, AM vê todos"); `Inicio` já é escopado por `useMySquads`.
- Associação a squad é feita só por AM em `/admin` (insert em `squad_members`); exige que a pessoa já tenha logado 1x.

## 2. Modelo alvo

| Papel | Escopo de LEITURA | Escopo de GESTÃO |
|---|---|---|
| **Admin global** (Diego) | tudo | tudo (conteúdo do modelo, squads, membros, restart/delete) |
| **SM/AM de squad** | apenas os squads onde tem papel | apenas os próprios squads (membros, ciclos, propostas; AM homologa/oficializa) |
| **Membro (team/po/tl)** | apenas seus squads | kaizens do squad (como hoje) |
| Sem squad | nada além do Guia/conteúdo | — |

## 3. Desenho da implementação

### 3.1 Novo conceito: admin global explícito
- Nova tabela `portal_admins(user_id uuid pk references profiles)` + função
  `is_portal_admin()` (security definer: `exists(select 1 from portal_admins where user_id = auth.uid())`).
- Seed: o user_id do Diego. RLS de `portal_admins`: SELECT/ALL só `is_portal_admin()` (bootstrap via migration).
- Motivo de NÃO reusar `user_roles/is_admin` legado: está marcado legado, misturado com policies antigas; melhor conceito limpo e migração de limpeza separada.

### 3.2 Substituições de `is_any_am()` (policy a policy)
| Policy atual | Novo predicado |
|---|---|
| `content_write_*` (axes/stages/dimensions/descr/anchors) | `is_portal_admin()` |
| `sqm_read` | `user_id = auth.uid() OR is_member(team_id) OR is_portal_admin()` |
| `sqm_write` (gestão de membros) | `is_portal_admin() OR is_am(team_id) OR is_sm(team_id)` ← SM gerencia o próprio squad |
| `teams_read` | `is_member(id) OR is_portal_admin()` |
| `teams_write` | `is_portal_admin() OR is_am(id) OR is_sm(id)` (metadados do próprio squad) |
| `cycles_read`, `prop_read`, `homolog_read`, `kz_read`, `read_readings` | `is_member(...) OR is_portal_admin()` |
| RPC `restart_assessment` | `is_portal_admin() OR is_am(p_team)` |
| RPC `delete_squad` | **só `is_portal_admin()`** (destrutivo demais para AM de squad) |
| INSERT em `teams` (criar squad) | só `is_portal_admin()` (Admin cria; SM não cria squads) — derrubar policy legada de owner |

### 3.3 Limpeza das camadas legadas (mesma migration)
- DROP das policies legadas de `teams` (`owner/public/admin` de `20251113192839` e `20260617130000`).
- Avaliar DROP da tabela `votes` (morta) e revogar policies restantes que citem `is_admin()` nas tabelas do MMA.
- `profiles`: restringir SELECT a `is_portal_admin() OR` compartilhamento de squad (subquery em `squad_members`) — decisão pendente do Diego (o Admin usa o diretório para adicionar membros; SM só precisa buscar por e-mail → considerar RPC `find_profile_by_email` security definer para não abrir o diretório).

### 3.4 Front-end
- `RequireAM` → `RequireManager` (tem `sm` ou `am` em ALGUM squad, OU admin): guarda o `/admin`.
- **AdminMMA em dois modos**: admin global (lista todos os squads, cria/exclui squad, gerencia conteúdo) vs gestor (lista SÓ os squads onde é SM/AM; sem criar/excluir squad; gerencia membros dos seus). O hook `useAdminTeams` já retornará escopado pela RLS — a UI precisa só esconder ações não permitidas (a RLS é o enforcement real).
- Novo hook `useIsPortalAdmin()` (RPC `is_portal_admin`).
- `Torre`: nada a mudar no código — a RLS nova já escopa (membro/SM vê os seus; admin vê todos).
- Onboarding de novos SMs: Diego (admin) cria o squad e adiciona o SM com papel `sm`/`am` em `/admin`.

### 3.5 Migração (1 arquivo SQL novo)
1. `create table portal_admins` + `is_portal_admin()` + seed Diego.
2. `create or replace` das policies (drop/create) conforme 3.2.
3. Drops das legadas (3.3).
4. `create or replace` dos RPCs `restart_assessment`/`delete_squad` com os novos predicados.

## 4. Testes de aceite (usar no QA-PLAN B4)
Matriz com 4 identidades: admin (Diego), SM do squad A, membro do squad A, SM do squad B.
- SM-A lê teams/cycles/proposals/kaizens de A ✅ e de B ❌ (0 linhas).
- SM-A adiciona membro em A ✅, em B ❌ (RLS error).
- SM-A NÃO edita axes/dimensions ❌; admin ✅.
- SM-A `restart_assessment(A)` ✅ se AM, ❌ se só SM (decidir!); `delete_squad(A)` ❌; admin ✅.
- Membro-A não gerencia membros ❌; edita kaizens de A ✅.
- Torre: SM-A vê só A; admin vê todos.
- Usuário sem squad: Torre vazia, `/admin` inacessível.

## 5. Questões em aberto para o Diego decidir antes de implementar
1. `restart_assessment` — SM pode, ou só AM do squad (+admin)?
2. Diretório `profiles` — aberto como hoje, ou fechado com busca por e-mail via RPC?
3. SM pode editar metadados do squad (nome/tower/status) ou só membros?
4. Alguém além do Diego será admin global (backup de acesso)?
