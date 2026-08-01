# Ficha da pessoa — administração de gente no NEO

> Desenho aprovado por Diego em 2026-07-31, dentro da rodada do RBAC. Complementa
> [`../../../maturitymodel/docs/PAPEIS.md`](../../../maturitymodel/docs/PAPEIS.md) e o plano do
> RBAC. **Não commitado** — como todo o resto desta rodada.

## O problema

O RBAC entregou a matriz papel × função editável. Falta o outro lado: **administrar as
pessoas**. O caso concreto que motivou isto, nas palavras do Diego:

> "às vezes o Tiago vai sair e entrar outra pessoa e, essa pessoa pode ter times novos"

Hoje isso é impossível de fazer bem, por três razões:

1. **Não existe editar nome.** O banco já permite (`neo.people.edit_any` + a policy
   `profiles_admin_update`), mas não há UI. E o problema é maior do que parece: `full_name` é
   gravado **uma vez**, num trigger `after insert on auth.users`, com
   `coalesce(raw_user_meta_data->>'full_name', new.email)`. Como o login é OTP e não envia
   nome, **o "nome" de quase todo mundo é o próprio e-mail** — e nada nunca sobrescreve.
2. **A administração de squads é squad-cêntrica.** Tirar uma pessoa de 3 times exige abrir 3
   telas. A pergunta que o operador tem na cabeça é sobre a PESSOA, não sobre o squad.
3. **Desligar alguém não é uma operação.** É revogar papéis + remover vínculos, feito à mão,
   sem atomicidade e sem trilha — remover alguém de um squad não é auditado hoje.

## O que NÃO está no escopo

- **Editar e-mail.** É a identidade do login; muda no Supabase, não aqui.
- **Criar pessoa.** Quem cria é o primeiro login por OTP. A ficha só existe depois.
- **Transferir cargo em um passo.** Considerado e descartado: o próprio caso diz que a pessoa
  nova pode ter times DIFERENTES, então "herdar os squads do antecessor" seria o default errado.

## A tela

`Pessoas` deixa de ser tabela de concessões e vira **lista de gente → ficha**. A tela
`Squads e membros` permanece: ela responde "quem está neste squad?", que é outra pergunta.

### A lista é uma união, e isso é load-bearing

Convivem dois conjuntos:

| Conjunto | Origem | Tem `user_id`? |
|---|---|---|
| Quem já entrou | `profiles` | sim |
| Quem só tem papel concedido por e-mail | `portal_roles` | não necessariamente |

A lista mostra os dois, marcando quem **nunca fez login**. Consequência que a UI tem de
respeitar em vez de esconder: **squad exige conta**, porque `squad_members` é chaveado por
`user_id`. Para quem nunca logou, o bloco de squads aparece desabilitado com a explicação — a
regra do repo é nunca renderizar formulário que o banco vai recusar.

### Blocos da ficha

| Bloco | Grava em | Permissão |
|---|---|---|
| Nome | `profiles.full_name` | `neo.people.edit_any` |
| E-mail | — (leitura) | — |
| Papel global | `portal_roles` (revogação exige motivo) | `neo.roles.manage` |
| Squads e papel em cada um | `squad_members` | `mma.member.manage` |
| Desligar | RPC `offboard_person` | as duas acima |

Cada bloco some sem a permissão. Efeito desejado: o **Admin** renomeia e mexe em squads mas não
concede papel; o **Admin Geral** faz tudo. Sai do modelo já semeado, sem regra nova.

Quando `full_name = email`, a ficha marca **"nunca definido"** — sem isso ninguém distingue o
nome real do default do trigger.

## `offboard_person(p_email, p_reason)` — por que RPC e não N chamadas

Sair da empresa é UMA intenção. Em N chamadas do cliente, meio-falha: revoga o papel, erra no
terceiro squad, e a pessoa fica sem papel e dentro de dois times — o pior estado possível,
porque parece resolvido.

```
security definer, transação única:
  1. recusa motivo vazio
  2. exige has_perm('neo.roles.manage') E has_perm('mma.member.manage')
  3. snapshot ANTES (papéis ativos + squads)
  4. revoga os papéis globais com o motivo
  5. remove os vínculos de squad
  6. grava em destructive_audit (action='offboard_person')
  7. devolve o que foi feito, para a tela poder dizer
```

O trigger `protect_last_admin` continua valendo: desligar o último Admin Geral **aborta** a
transação inteira. É o comportamento certo e não precisa de código novo.

**Sem permissão nova no catálogo** — reaproveita duas existentes, então `test:perms` não muda.

## Testes

- `tests/pg/rls-local.ts`, parte nova: desliga com as duas permissões (funciona, trilha
  escrita, snapshot com os papéis e squads de antes) · AM não desliga · motivo vazio recusa ·
  desligar o último Admin Geral aborta · idempotente (segunda chamada não explode e não
  duplica trilha) · pessoa sem conta tem papel revogado e zero squads removidos.
- `tests/pg/rollback.ts`: o DOWN entra na ordem da rodada.
- `tests/pg/apply-migrations.ts`: a função existe; a lista `RODADA_RBAC` passa a ser a fonte
  única da ordem (ver abaixo).

## Uma correção de teste que vem junto

`NEWEST_MIGRATION` é usada em dois lugares como "o ponto onde os revokes são restaurados"
(porque o shim concede os defaults do Supabase DEPOIS das migrations, invertendo a ordem real).
Isso já quebrou uma vez nesta rodada: ao acrescentar a migration do `/api/authz`, o ponto de
restauração se mudou sozinho e a asserção `anon não tem EXECUTE em can_sync_anchors` falhou.

Trocar por uma lista ordenada **`RODADA_RBAC`** em `apply-migrations.ts`, usada por
`rls-local.ts` e `rollback.ts`. Assim acrescentar a próxima migration é editar um array, e não
descobrir pelo teste vermelho qual asserção parou de medir o que dizia medir.
