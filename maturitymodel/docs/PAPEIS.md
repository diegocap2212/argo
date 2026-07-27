# Papéis e jornada — Portal MMA

> **STATUS: CÓDIGO PRONTO E EXECUTADO EM POSTGRES, NÃO APLICADO EM PRODUÇÃO** (2026-07-26).
> A migration foi **executada de verdade** (PGlite/WASM): as 51 migrations aplicam em ordem, a
> migração de dados foi ensaiada e a matriz de papéis roda com RLS real — **59 asserções verdes**.
> Falta aplicar em branch Supabase e promover — ver [`../../HANDOFF.md`](../../HANDOFF.md).
>
> Executar em vez de só revisar achou **dois defeitos que a revisão de código não pegou** (§6b) e
> **um vazamento de privacidade pré-existente** (§6c).

Substitui [`ROLES-REDESIGN.md`](ROLES-REDESIGN.md) (modelo de 15/07, AM por squad).

## 1. Por que mudou

O relato foi: *"salesforce vendas já testou, mas não aparece pra mim que preciso homologar."*

Não era um bug. Eram **seis causas somadas**:

| # | Causa | Onde estava |
|---|---|---|
| 1 | `useMySquads` consultava só `squad_members` do próprio usuário — sem ramo para papel global | `src/hooks/useMySquads.ts` |
| 2 | **AM era por squad**, então quem homologa só via o squad em que era membro | migration de 15/07 |
| 3 | O array da jornada na home não tinha `pre_session` → `findIndex` = -1 → exibia "Sessão" | `src/pages/Inicio.tsx` |
| 4 | `isPendingFor` ignorava `pre_session` → o SM que devia a análise prévia lia "Tudo certo" | `src/hooks/useMySquads.ts` |
| 5 | A home mostrava `slice(0, 3)` sem fila e sem separar "espera a MINHA ação" | `src/pages/Inicio.tsx` |
| 6 | `Homologacao.tsx` barrava em `role.isAM` — papel de squad | `src/pages/squad/Homologacao.tsx` |

A (2) é pré-requisito da (1): sem AM global não existe fila de homologação para a home mostrar.
Por isso o permissionamento veio primeiro.

**O que sobrava de papel:** `po`, `tl` e `team` não tinham **nenhuma** consequência funcional. O voto
individual morreu na sessão colaborativa (`votes` está marcada `MORTA` em migration) e a sessão é
gravada só pelo facilitador (`const facilitator = role.isSM || role.isAM`). Colapsá-los em `member`
foi remoção de ruído, não perda de recurso.

## 2. Os dois níveis de papel

A distinção que antes não existia, e que é o coração do modelo:

| Nível | Tabela | Valores | Significa |
|---|---|---|---|
| **Portal** (global) | `portal_roles(email, role)` | `admin`, `am` | Autoridade em **todos** os squads |
| **Squad** (local) | `squad_members(team_id, user_id, role)` | `sm`, `member` | Vínculo com **um** squad |

`portal_roles` é chaveada por **e-mail**, como o `portal_admins` que ela substitui: permite conceder
papel a quem ainda não fez o primeiro login (não existe em `auth.users` nem em `profiles`).

`is_portal_am()` devolve `true` para o admin de propósito — "admin geral faz tudo" — o que evita
repetir `is_portal_admin() or is_portal_am()` em ~15 policies. **Por isso ela não serve para as ações
exclusivas de admin**, que continuam checando `is_portal_admin()` direto.

## 3. Matriz de permissão

| Ação | admin | AM | SM | member |
|---|:---:|:---:|:---:|:---:|
| Ver todos os squads | ✅ | ✅ | ❌ (só os seus) | ❌ (só os seus) |
| Rodar pré-sessão / sessão | ✅ | ✅ | ✅ (seus) | ❌ |
| Homologar / oficializar | ✅ | ✅ | ❌ | ❌ |
| Devolver homologação → sessão | ✅ | ✅ | ❌ | ❌ |
| Arquivar ciclo | ✅ | ✅ | ❌ | ❌ |
| Reiniciar assessment | ✅ | ❌ | ❌ | ❌ |
| Excluir squad | ✅ | ❌ | ❌ | ❌ |
| Gerir membros, squads e papéis | ✅ | ❌ | ❌ | ❌ |
| Editar conteúdo do modelo (eixos, dimensões, âncoras) | ✅ | ❌ | ❌ | ❌ |

**Mudou em relação a 15/07:** SM/AM **não** gerenciam mais membros nem metadados do próprio squad.
Estrutura da organização (quem existe, quem está onde, como se chama) virou ação de admin. Duas
razões: o AM agora é global, então "gerenciar o próprio squad" passaria a significar gerenciar todos;
e com papel de squad reduzido a dois valores não há mais o que delegar. `/admin` ficou admin-only
(`RequireAdmin`) — deixar a tela acessível a quem a RLS recusa é pior que não mostrá-la, porque o
formulário só falha no envio.

**Consequência operacional a aceitar:** adicionar alguém a um squad passa pelo admin. Se isso gerar
fila, o ajuste é de uma linha — devolver `is_sm(team_id)` ao `using`/`with check` de `sqm_write`.

## 4. Efeito colateral bom: a escalação SM→AM desapareceu

A migration de `20260715150000_fix_sm_am_privilege_escalation.sql` corrigiu, com uma cláusula de
policy, o fato de um SM poder gravar `role='am'` em `squad_members` e assim se promover.

Agora `'am'` **não é valor válido** naquela coluna (`check (role in ('sm','member'))`) e conceder papel
global exige escrever em `portal_roles`, que é admin-only. O vetor foi eliminado **estruturalmente**,
não remendado. A matriz de RLS testa isso explicitamente.

## 5. A jornada, agora enforced no banco

Até 26/07 a máquina de estados vivia **só** no TypeScript (`CYCLE_TRANSITIONS`); o banco aceitava
qualquer `status <> 'official'`. Um cliente fora da UI podia pular da pré-sessão direto para a
homologação.

O trigger `cycle_transition_guard` fecha isso, e é onde "conectada aos roles" acontece de fato:

```
pre_session  → session        SM do squad ou AM
session      → homologation   SM do squad ou AM
homologation → official       AM        (na prática via RPC officialize_cycle)
homologation → session        AM        ← A VOLTA: devolver o pacote
official     → archived       AM
qualquer     → pre_session    admin     (é o restart_assessment)
```

Duas decisões de implementação que são load-bearing:

1. **`SECURITY INVOKER`, não definer.** O guarda precisa ler `current_user` do *chamador*. Num
   `SECURITY DEFINER` ele seria sempre o owner e o bypass abaixo nunca bateria.
2. **Bypass para quem não é `authenticated`/`anon`.** service_role, `postgres` e o SQL editor passam
   direto. Sem isso um ciclo travado num status errado seria **irrecuperável**: nem seed, nem script
   de manutenção, nem o dashboard conseguiriam corrigi-lo. Os RPCs (`officialize_cycle`,
   `restart_assessment`) são `SECURITY DEFINER` e também caem no bypass — está certo, cada um checa a
   própria autorização no corpo.

### O contrato TS × SQL

A máquina de estados está escrita **duas vezes** por imposição de runtime (o navegador não executa
plpgsql; o Postgres não importa TypeScript). `tests/journey-contract.ts` lê o SQL como **texto** e
compara par a par com `CYCLE_TRANSITIONS`, além de conferir que `CYCLE_JOURNEY` cobre exatamente os
status do `CHECK` do banco.

Não precisa de banco, roda no CI, e foi **verificado que falha**: removendo `pre_session` da jornada
(o bug original) o teste fica vermelho na asserção certa.

## 6. Outros defeitos corrigidos no caminho

| Defeito | Consequência que tinha |
|---|---|
| `restart_assessment` voltava para `'session'` | Desde 24/07 o ciclo nasce em `pre_session`; resetar **pulava a análise prévia**. Agora volta para `pre_session` e limpa `pre_session_assessments` |
| `officialize_cycle` chamado 2× | O `insert` de kaizens rodava de novo e **duplicava o plano**. Agora o update filtra `status = 'homologation'` e a 2ª chamada é recusada |
| `SquadSwitcher` mapeava `voting`/`workshop`/`proposed` e **não** tinha `pre_session`/`session` | Renderizava `undefined` como rótulo e como classe do ponto, nos dois estados em que os ciclos realmente ficam |
| `AdminCycle.status` sem `pre_session` | A tela de admin exibia um status que o TypeScript dizia impossível |
| Jornada escrita em 3 lugares (`Inicio`, `CycleJourney`, tipos) | Era a causa-raiz da classe de bug. Agora `CYCLE_JOURNEY`/`CYCLE_ORDER`/`squadRouteFor` em `src/types/mma.ts` são a fonte única |

## 6b. Defeitos achados ao EXECUTAR a migration (não pela revisão)

Rodar as 51 migrations num Postgres limpo achou dois erros que passaram por revisão:

**1. Ordem do `CHECK` de `squad_members.role`.** A migração de dados fazia
`update ... set role='member'` **antes** de derrubar o CHECK antigo — e o antigo é
`role in ('team','po','tl','sm','am')`, que **não aceita `'member'`**. O update falhava com
`23514` e a migration inteira abortava. Eu havia raciocinado sobre o CHECK *novo* e esquecido que o
*velho* também barra. Ordem correta: `drop constraint` → `update` → `add constraint`.

**2. `officialize_cycle` reescrito perdia a geração de kaizens.** Ao trocar o predicado de
`is_am(team)` para `is_portal_am()` eu reescrevi a função e apaguei, sem notar, a checagem de
completude, o `homologated_by` e o `insert` que **gera os kaizens** — a etapa "Plano" da jornada.
Peguei relendo o original antes de aceitar a reescrita; hoje existe asserção específica
("oficializar gerou kaizens") para que não volte.

## 6c. Vazamento de diretório — pré-existente, corrigido aqui

Auditando as 64 policies do schema apareceu:

```
profiles."Authenticated users can view all profiles"  [SELECT, role public]  using (auth.uid() is not null)
```

**Policies do mesmo comando somam com OR.** Essa policy legada sobreviveu à limpeza de 15/07 (que
derrubou `"Users can view all profiles"` e `profiles_read`, mas não esta, de nome diferente) e
**anulava** a `profiles_read` restritiva. Qualquer usuário autenticado lia **e-mail e nome de todas
as pessoas**. O "diretório de pessoas fechado", registrado como IMPLEMENTADO em
[`ROLES-REDESIGN.md`](ROLES-REDESIGN.md), nunca esteve fechado.

Corrigido junto: `"Admins can update any profile"` dependia de `is_admin(auth.uid())`, que lê a
tabela **legada** `user_roles` — uma linha esquecida ali dava poder de editar qualquer perfil.

E nas 4 tabelas do Maturity Model antigo (`themes`, `levels`, `questions`,
`theme_level_descriptions`) havia `for all to public using (true)`. `public` inclui **`anon`**: era
escrita com a chave anônima. Tabelas mortas (zero referências em `src/`, verificado), então fechar a
permissão não tem risco funcional — mas primitiva de escrita sem autenticação é achado de pentest de
qualquer jeito. As tabelas ficam; só a permissão saiu.

Três asserções novas guardam essa família: nenhuma policy de SELECT em `profiles` com predicado
trivial, nenhuma policy de `profiles` dependendo de `is_admin`/`user_roles`, e **nenhuma policy de
escrita alcançando `public`/`anon` em todo o schema**.

## 7. Defeito conhecido, NÃO corrigido (deliberado)

**O script `npm run typecheck` do MMA não checa nada.** `tsconfig.json` tem `"files": []` com
`references`, e `tsc --noEmit` sem `--build` não compila projeto referenciado. Foi por isso que as
lacunas de `pre_session` e os mapas mortos do `SquadSwitcher` passaram sem ninguém ver — o
`Record<CycleStatus, string>` acusava desde 24/07.

Apontá-lo para `tsconfig.app.json` revela **214 erros**, dos quais ~135 são `TS2786` de
`@types/react@19.2.17` vazando (o `nero-portal` é Next 16/React 19; o MMA é React 18). Nenhum é do
código de papéis — verificado arquivo por arquivo.

**Não mexi** porque tornar o script vermelho treina o time a ignorá-lo, e resolver o vazamento de
`@types/react` mexe na árvore de dependências dos três apps na véspera do handoff. O guarda da classe
de bug que importa aqui ficou no `tests/journey-contract.ts`, que é verde e roda no CI. A correção do
toolchain é uma tarefa própria, com o diagnóstico já pronto acima.

## 8. Onde está cada coisa

| Camada | Arquivo |
|---|---|
| Migration | `supabase/migrations/20260726120000_portal_roles.sql` |
| Rollback (rodar à mão) | `supabase/rollback/20260726120000_portal_roles_DOWN.sql` |
| Papel do portal (hook) | `src/hooks/usePortalRole.ts` |
| Escopo de squads + pendências | `src/hooks/useMySquads.ts` |
| Papel resolvido dentro de um squad | `src/hooks/useSquadRole.ts` |
| Home adaptativa | `src/pages/Inicio.tsx` |
| Concessão de papel global | `src/pages/AdminMMA.tsx` + `src/hooks/useAdminData.ts` |
| Jornada (fonte única) | `src/types/mma.ts` |
| Matriz de RLS no Supabase real (precisa de branch) | `tests/rls/rls-matrix.ts` — `pnpm test:rls` |
| Contrato TS × SQL (sem banco) | `tests/journey-contract.ts` — `pnpm test:journey` |
| **Migrations aplicando em Postgres limpo** (sem banco) | `tests/pg/apply-migrations.ts` — `pnpm test:migrations` |
| **Papéis + jornada com RLS real** (sem banco) | `tests/pg/rls-local.ts` — `pnpm test:rls-local` |
| Camada mínima do Supabase para o PGlite | `tests/pg/supabase-shim.ts` |

### Sobre o harness em PGlite

`tests/pg/` roda **Postgres de verdade compilado em WASM** — sem Docker, sem nuvem, sem credencial.
Funciona porque RLS, triggers, policies e `security definer` são **núcleo do Postgres**; o que o
Supabase acrescenta e as migrations usam é uma superfície pequena e medida: `auth.uid()` (73×),
`auth.users` (18×), `auth.jwt()` (7×) e os papéis `anon`/`authenticated`/`service_role`.
`supabase-shim.ts` emula exatamente isso.

**O que ele prova:** que as migrations aplicam em ordem num banco vazio; que a migração de dados
converte todo AM por squad em AM global; que as policies concedem e negam como a matriz manda; que a
jornada funciona nos dois sentidos.

**O que ele NÃO prova:** GoTrue (login, OTP, refresh), Realtime, Storage, `pg_cron`/`pg_net` (o único
migration pulado é o do sync de âncoras, que só agenda um job HTTP), e — o mais importante — **que o
estado da produção casa com a soma das migrations**. Só `pnpm test:rls` contra um branch Supabase
fecha esse último ponto.
