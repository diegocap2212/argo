# DESIGN.md · Portal MMA + Locavia

> Charter de design do Portal MMA integrado ao Locavia Dashboard. Versão 1.0 · 2026-07-12.

## Identificação

| Campo | Valor |
|---|---|
| Produto | Portal MMA (Maturity Model Assessment) fundido ao Locavia Dashboard |
| Cliente / contexto | LM Mobilidade · torre ágil Blite |
| Responsável | Diego (Agile Master) |
| Accent | Produto denso, com desvio Locavia documentado |

## Assunto e trabalho da aplicação

O assunto concreto é o ritual trimestral em que um squad olha para a própria maturidade, vota em silêncio, revela junto, discute com dados na mesa e sai com um plano kaizen. O produto transforma percepção individual em estágio oficial confiável, ancorado em dados do Locavia e convertido em plano kaizen com o mínimo de cerimônia fora do workshop. A audiência primária são SMs, POs, TLs, times e AMs.

O universo inclui voto secreto e revelação simultânea; os estágios de Tuckman Formação → Confronto → Normalização → Performance; 10 dimensões nos eixos Processo, Produto e Time; âncoras com veredito sustenta, limita ou conflita; e kaizen como continuação.

Vocabulário obrigatório: dimensão, estágio, âncora, veredito, homologação e ciclo. Não usar “nota” para maturidade nem “PDTI” para métricas.

## Cor

- `accent`: `#2BE86B`, somente ação principal, estado ativo e marca. Nunca em áreas grandes.
- `accent-strong`: `#1FAA52`, hover e texto de accent no tema claro.
- `apoio-violet`: `#8A38F5`, segunda série de dataviz e comparativo Q×Q; nunca botão.
- fundo: `#0F1115` dark / `#FAFAF9` light.
- superfície: `#181B22` dark / `#FFFFFF` light.
- texto: `#E6E8EE` dark / `#1F2024` light.
- tema padrão dark; light completo para apresentação e relatórios.
- vereditos usam feedback: sucesso `#34D399`, aviso `#FBBF24`, erro `#F87171`, informação `#60A5FA`. Accent não significa sucesso.

## Tipografia

- Newsreader 500–600: títulos editoriais e momentos de reflexão/ritual.
- Inter 400–600: UI, gestão, tabelas e formulários.
- JetBrains Mono 400–500: métricas, âncoras e deltas.
- Hierarquia por peso e tamanho; cor somente para estado.

## Layout e navegação

- Dois ritmos: gestão densa e ritual respirado. Torre, Métricas e Homologação são gestão; Avaliação, Workshop e Apresentação são ritual.
- Sidebar somente global: Início, Torre, Guia e Admin.
- Contexto de squad vive no dropdown do header, com pendências quando existirem.
- Jornada de gestão: Torre → Agilista → Time → Métricas.
- Telas-alvo: Início, Torre, Minha Avaliação, Workshop, Homologação, Plano, Métricas, Comparativo Q×Q e Modo Apresentação.

## Assinatura e atrito

A assinatura é a revelação simultânea dos votos no Workshop e no Modo Apresentação. Durante o voto, cartões ficam virados e neutros; no reveal, viram juntos, a divergência aparece como distância na régua de estágios e as âncoras do Locavia acendem ao lado. Um eco discreto pode existir no Comparativo Q×Q. O flip não aparece em dashboards, Torre, Métricas ou Homologação. Com `prefers-reduced-motion`, usar fade.

O voto é deliberadamente protegido: não mostrar parcial, média em tempo real ou edição após reveal. Estados do ciclo: votando → revelado → discutindo → fechado → homologado.

## Desvios da fundação Blite

| Elemento | Fundação Blite | Produto integrado | Racional |
|---|---|---|---|
| Accent | Magenta `#FF2993` | Verde `#2BE86B` | White-label LM / Venice by blite |
| Display | Inter | Newsreader | Separar ritmo editorial do ritual e gestão |
| Logo | Blite | Venice by blite | Contexto white-label |

Todo o restante herda os neutros, feedback, raios, escala de espaçamento 4px, sombras, movimento de 120–300ms, foco e voz Blite.

## Regras de execução

1. Verde é destaque, nunca fundo amplo.
2. Newsreader em tabela ou formulário é bug.
3. Telas de gestão são densas, gráficas e comparáveis; tabelas são apoio.
4. Copy traz conclusão primeiro e número no lugar de adjetivo.
5. Todo veredito de âncora mostra a regra que o gerou, incluindo folga de 20%.
6. Responsividade, foco visível, contraste AA e movimento de 120–300ms são obrigatórios.
7. Se a tela puder pertencer a qualquer SaaS genérico, revisar a partir do ritual, das âncoras e da jornada do domínio.
8. Anti-padrões: stat-card genérico como hero do Início; flip fora de Workshop/Apresentação; numeração 01/02/03 sem representar uma sequência real.
9. Todo veredito de âncora deve mostrar a regra que o gerou, incluindo a folga de 20%, a um toque.

## Pendências de aprovação

- Aplicar teste do genérico sobre o produto integrado.
- Validar contraste AA do accent; sobre branco, usar `accent-strong` para texto.
- Validar o protótipo nos dois ritmos e nos dois temas.
