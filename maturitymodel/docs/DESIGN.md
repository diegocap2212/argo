# DESIGN.md · Portal MMA + Locavia

> Charter de design deste produto. Herda os fundamentos da skill `estilo-blite`; desvios documentados em §7. Agentes de IA e devs leem este arquivo antes de gerar qualquer tela.

---

## 0. Identificação

| Campo | Valor |
|---|---|
| Produto | Portal MMA (Maturity Model Assessment) fundido ao Locavia Dashboard |
| Cliente / contexto | LM Mobilidade · torre ágil Blite |
| Responsável pelo charter | Diego (Agile Master) |
| Versão / data | v1.0 · 2026-07-12 |
| Contexto de accent | Produto (denso), com desvio de cor documentado (§7) |

---

## 1. Assunto, audiência e trabalho da tela

- **Assunto concreto:** o ritual trimestral em que um squad olha para a própria maturidade, vota em silêncio, revela junto, discute com dados na mesa e sai com um plano kaizen.
- **Audiência primária:** SMs que gerenciam vários squads (uso semanal, contexto de torre), POs, TLs e membros de time (uso concentrado no trimestre), AMs que homologam de forma assíncrona.
- **Trabalho único da aplicação:** transformar percepção individual em score oficial confiável, ancorado em dados do Locavia, com o mínimo de cerimônia fora do workshop.
- **Universo do assunto:** o voto secreto e a revelação simultânea; os 4 estágios de Tuckman como jornada (Formação → Confronto → Normalização → Performance); as 10 dimensões em 3 eixos (Processo / Produto / Time); a âncora de dado com veredito (sustenta / limita / conflita); o kaizen como continuação, não como fim.
- **Vocabulário do domínio:** usar "dimensão", "estágio", "âncora", "veredito", "homologação", "ciclo". Proibido: "PDTI" (usar termo genérico para o painel de métricas), "nota" (é "estágio", não nota escolar).

## 2. Cor

| Token | Hex | Papel | Regra de uso |
|---|---|---|---|
| `accent` | `#2BE86B` | ação principal, estado ativo, marca do produto | CTAs, links, indicador de estágio atual. Nunca em áreas grandes. |
| `accent-strong` | `#1FAA52` | hover, texto de accent sobre fundo claro (tema light) | |
| `apoio-violet` | `#8A38F5` | segunda série em dataviz, comparativo Q×Q | nunca como botão |
| `neutro-fundo` | `#0F1115` (dark) / `#FAFAF9` (light) | fundo | herda Blite |
| `neutro-superficie` | `#181B22` (dark) / `#FFFFFF` (light) | cards, painéis | herda Blite |
| `neutro-texto` | `#E6E8EE` (dark) / `#1F2024` (light) | texto | herda Blite |

- **Tema padrão:** dark (padrão Blite), com light completo para Modo Apresentação e relatórios.
- **Vereditos de âncora usam cor de feedback, não o accent:** sustenta = sucesso, limita = aviso, conflita = erro. O verde do accent nunca dobra como "sucesso" em vereditos; ali entra o token de feedback, para o significado não se contaminar.
- **Feedback:** herda `estilo-blite` (dark: `#34D399` / `#FBBF24` / `#F87171` / `#60A5FA`).

## 3. Tipografia

| Papel | Fonte | Pesos | Onde |
|---|---|---|---|
| Display | Newsreader | 500-600 | título de página, nome da dimensão na tela de voto, número do estágio no Modo Apresentação |
| Corpo | Inter | 400-600 | UI, descrições de célula, formulários |
| Utilitária / dados | JetBrains Mono | 400-500 | valores de âncora, métricas, deltas Q×Q |

- Newsreader é a voz "editorial" do ritual: aparece nos momentos de leitura e reflexão (a matriz tem conteúdo rico e ele merece tipografia de leitura). Fora desses momentos, Inter comanda.
- Hierarquia por peso e tamanho; cor só para estado.

## 4. Layout

- **Conceito:** a interface tem dois ritmos, gestão (denso, tabular, Inter, para o SM que roda a torre) e ritual (respirado, editorial, Newsreader, para o workshop e a apresentação). Cada tela pertence explicitamente a um ritmo.
- **Estrutura de navegação:** contexto de squad vive no dropdown do header com badges de pendência; a sidebar é só global (Início, Torre, Guia, Admin). Decisão fechada, não reabrir por tela.
- **Densidade:** densa em Torre, Métricas e Homologação; respirada em Minha Avaliação, Workshop e Modo Apresentação.
- **Telas:** Início, Torre, Minha Avaliação, Workshop, Homologação, Plano (kanban kaizen), Métricas, Comparativo Q×Q, Modo Apresentação.

## 5. Assinatura

- **A assinatura:** o momento de revelação. Durante o voto, os cartões dos participantes ficam virados (neutros, sem cor); no reveal, viram simultaneamente com uma única transição orquestrada, e a divergência aparece como distância visual entre os votos na régua de estágios, com as âncoras do Locavia acendendo ao lado.
- **Por que ela nasce do assunto:** a mecânica central da governança é o voto silencioso com revelação simultânea. É o único momento do produto que não existe em nenhum dashboard genérico; é dele que o produto tira identidade.
- **Onde aparece:** tela Workshop (completa) e Modo Apresentação (versão ampliada). Um eco discreto no Comparativo Q×Q (o "flip" do trimestre anterior para o atual).
- **O que ela NÃO é:** não vira animação decorativa em outras telas; cartões de Torre, Métricas e Homologação não flipam. A revelação é rara para continuar significando algo.

## 6. Atrito deliberado

- **Momento de desaceleração:** o voto. A interface não mostra votos parciais, não mostra média em tempo real e não permite editar depois do reveal. O SM fecha o score como especialista somente após a discussão das divergências.
- **Mecânica de proteção:** estados explícitos do ciclo (votando → revelado → discutindo → fechado → homologado), sem atalho de pular etapa; frases curtas de reconhecimento na tela de voto (a versão rica da célula fica a um toque, para consulta, não como muleta).

## 7. Desvios da fundação Blite

| Desvio | Padrão Blite | Valor neste produto | Racional |
|---|---|---|---|
| Accent | Magenta `#FF2993` / rosa suave | Verde `#2BE86B` | Produto white-label do cliente (design system Locavia Dashboard); a marca visível é "Venice by blite" |
| Display | Inter (única sans) | Newsreader (serifada) | O produto tem momentos editoriais (matriz rica, ritual); a serifada marca o ritmo "ritual" vs "gestão" |
| Logo | Logo Blite em toda peça | Logo "Venice by blite" | Contexto white-label; regra de fundo do logo segue a skill |

Tudo o mais (neutros, feedback, raios, espaçamento 4px, sombras, movimento 120-300ms, foco, voz de escrita) herda `estilo-blite` sem alteração.

## 8. Regras para agentes de IA

1. Leia este arquivo antes de gerar qualquer tela, componente ou copy do portal.
2. Cores e fontes saem das tabelas §2 e §3. O verde `#2BE86B` é destaque, nunca fundo; vereditos usam cores de feedback, nunca o accent.
3. Newsreader só nos momentos listados em §3. Se aparecer em tabela ou formulário, é bug.
4. Teste do genérico antes de entregar: se a tela pudesse ser de qualquer dashboard SaaS, revise a partir de §1 e §5.
5. Anti-padrões proibidos: stat-card genérico como hero do Início (o hero do Início é a pendência do ciclo, não um número decorativo); flip da revelação fora do Workshop/Apresentação; marcadores 01/02/03 fora da sequência real de estágios (ali a numeração é informação e é permitida).
6. Copy na voz Blite: conclusão primeiro, sem travessão, número no lugar de adjetivo. Vocabulário do domínio (§1); nunca "PDTI".
7. Piso de qualidade: responsivo, foco visível, `prefers-reduced-motion` desliga o flip da revelação (troca por fade), contraste AA nos dois temas.
8. Explicabilidade: todo veredito de âncora mostra a regra que o gerou (incl. folga de 20%) a um toque.

## 9. Checklist de aprovação

- [x] §1 preenchida antes da primeira tela
- [x] Paleta nomeada com regra de uso
- [x] Par tipográfico deliberado (Inter + Newsreader, com fronteira definida)
- [x] Assinatura única nascida do assunto (a revelação)
- [x] Atrito deliberado decidido (voto protegido)
- [x] Desvios documentados (§7)
- [ ] Teste do genérico aplicado sobre o protótipo atual (próximo passo)
- [ ] Validação de contraste AA do verde `#2BE86B` sobre superfícies dark e light (pendente: sobre branco o verde claro tende a falhar; usar `accent-strong` para texto no tema light)

---

## 10. Estado de implementação · desvios conscientes (2026-07-12)

Registro do que a implementação atual **diverge** deste charter, por decisão de escopo desta sessão (aprovada pelo Diego). Não são bugs — são desvios documentados.

| Item do charter | Implementação atual | Racional |
|---|---|---|
| **§1/§5/§6 — voto secreto individual + revelação simultânea (a assinatura)** | **Modelo de sessão colaborativa:** o facilitador (SM/AM) apresenta cada dimensão e registra a **nota de consenso do grupo**. Não há voto individual sigiloso, tela de Workshop com revelação, nem o "flip". | Decisão de produto: reduzir cerimônia/infra (sem tabela de votos, RLS de sigilo, revelação). A assinatura da §5 fica **adiada** — se o voto individual voltar ao escopo, a revelação é a tela a construir. |
| **§2 — accent + tema/fundos** | **Híbrido:** accent `#2BE86B` (disciplinado, só destaque) + `accent-strong #1FAA52` p/ texto no claro, conforme o charter. Porém os **neutros são quentes** ("Papel & tinta": fundo `#f7f6f3` claro / charcoal quente no escuro), não os neutros frios Blite (`#0F1115`/`#FAFAF9`). **Tema padrão = claro** (não dark). | O Diego reagiu ao verde vivo em excesso; a solução foi disciplinar o accent (charter) mantendo fundos quentes legíveis dos dois lados. Contraste do accent como **texto** no claro resolvido com `accent-strong`. |
| **§3 — Newsreader só em título/ritual** | Aplicado: serif nos **títulos de página**, momentos de **ritual** (Sessão, Guia, Apresentação) e **números de estágio/nível**. Títulos de card **secundários** em telas de gestão (ex.: Comparativo) e controles de UI usam **Inter**. | ✅ fronteira serif↔Inter aplicada. |

Tokens vivos em `src/index.css` (`:root` e `[data-theme="dark"]`) e `tailwind.config.ts` (`venice.*`, incl. `venice.violet`). A troca de qualquer valor de token re-skina o app inteiro.
