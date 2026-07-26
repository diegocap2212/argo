import type Anthropic from "@anthropic-ai/sdk";
import {
  addChecklistItem,
  addRisk,
  createFeature,
  editFeature,
  MEMORIA_SECOES,
  recordDecision,
  setFeatureStatus,
  setPhase,
  setStackItem,
  toggleChecklistItemByText,
  upsertBaselineMetric,
  upsertCatalogAsset,
  upsertDataField,
  upsertDependency,
  upsertMaturityAssessment,
  upsertProjectNote,
  upsertStakeholder,
} from "@/lib/state/mutations";
import { STATUS_VERDADE } from "@/lib/state/provenance";
import { DAMA_AREAS } from "@/lib/state/dama";
import { searchBiblioteca, readDocumentForNero } from "@/lib/biblioteca/search";
import { SENSIBILIDADES } from "@/lib/catalog/sensibilidade";

/**
 * Tools que o Nero pode usar para ESCREVER no estado vivo (01). Cada chamada
 * grava uma StateVersion (auditoria + undo). Conjunto enxuto e de alto valor.
 */

export const NERO_TOOLS: Anthropic.Tool[] = [
  {
    name: "registrar_decisao",
    description:
      "Registra uma decisão no log de decisões do projeto (seção 4 do 01). Use quando uma decisão for tomada na conversa.",
    input_schema: {
      type: "object",
      properties: {
        decisao: { type: "string", description: "A decisão, em uma frase." },
        porque: { type: "string", description: "Justificativa breve." },
        quem: { type: "string", description: "Quem decidiu." },
        faseSlug: { type: "string", description: "Slug da fase relacionada (ex.: 'fase-0'). Opcional." },
      },
      required: ["decisao"],
    },
  },
  {
    name: "definir_stack",
    description:
      "Define/atualiza um item do stack do Data Lake com seu status de verdade (teoria × realidade). Use ao confirmar ou assumir informação de ambiente.",
    input_schema: {
      type: "object",
      properties: {
        item: { type: "string", description: "Nome do item de stack (ex.: 'Plataforma do Data Lake')." },
        resposta: { type: "string", description: "Valor/resposta." },
        statusVerdade: {
          type: "string",
          enum: [...STATUS_VERDADE],
          description: "template (ideal DAMA), assumido (premissa), confirmado (validado com o LM), lacuna.",
        },
        proveniencia: { type: "string", description: "Fonte / quem confirmou / quando." },
      },
      required: ["item", "statusVerdade"],
    },
  },
  {
    name: "atualizar_dependencia",
    description:
      "Cria ou atualiza uma dependência do cliente LM (seção 7 do 01). Aging é calculado a partir de solicitadoEm.",
    input_schema: {
      type: "object",
      properties: {
        codigo: { type: "string", description: "Código curto (D1, D2, ...)." },
        descricao: { type: "string" },
        solicitadoEm: { type: "string", format: "date", description: "Data do pedido (YYYY-MM-DD)." },
        status: { type: "string", enum: ["aguardando", "recebido", "cancelado"] },
        trilhoParalelo: { type: "string", description: "O que avança sem o cliente." },
        decisaoPedida: { type: "string" },
        faseSlug: { type: "string", description: "Slug da fase relacionada (ex.: 'fase-0'). Opcional." },
      },
      required: ["codigo"],
    },
  },
  {
    name: "adicionar_risco",
    description:
      "Adiciona um risco/blocker. Ligue-o ao epic afetado via featureCodigo (aparece dentro daquele card no roadmap). Se for um risco da fase inteira (não de um epic específico), use só faseSlug.",
    input_schema: {
      type: "object",
      properties: {
        codigo: { type: "string", description: "Código curto (R1, R2, ...)." },
        descricao: { type: "string" },
        severidade: { type: "string", enum: ["Alta", "Média", "Baixa"] },
        mitigacao: { type: "string" },
        dono: { type: "string" },
        featureCodigo: {
          type: "string",
          description: "Código do epic/feature afetado (ex.: 'F0.3'). Preferível quando o risco é de um epic. Deriva a fase automaticamente.",
        },
        faseSlug: { type: "string", description: "Slug da fase (ex.: 'fase-0'), para risco da fase inteira. Ignorado se featureCodigo for dado." },
      },
      required: ["codigo", "descricao"],
    },
  },
  {
    name: "definir_fase",
    description: "Atualiza o status (RAG), % e comentário de uma fase do roadmap (seção 6 do 01).",
    input_schema: {
      type: "object",
      properties: {
        fase: { type: "string", description: "Nome exato da fase (ex.: 'Fase 0 — Mobilização & Discovery')." },
        rag: { type: "string", enum: ["cinza", "amarelo", "verde", "vermelho"] },
        pct: { type: "integer", description: "Percentual de conclusão (0-100)." },
        comentario: { type: "string" },
      },
      required: ["fase"],
    },
  },
  {
    name: "definir_feature",
    description:
      "Atualiza o status de uma feature do roadmap (ex.: F0.1). Use quando a feature mudar de estado durante a conversa.",
    input_schema: {
      type: "object",
      properties: {
        codigo: { type: "string", description: "Código da feature (ex.: 'F0.1', 'F1.3')." },
        status: {
          type: "string",
          enum: ["nao_iniciada", "em_andamento", "concluida", "bloqueada"],
          description: "Novo status da feature.",
        },
      },
      required: ["codigo", "status"],
    },
  },
  {
    name: "criar_feature",
    description:
      "Cria uma feature NOVA no roadmap, sob uma fase. Use quando uma feature inédita for proposta/decidida na conversa (o roadmap evolui). Para apenas mudar o status de uma feature que já existe, use definir_feature. Features novas nascem como premissa a confirmar com o LM.",
    input_schema: {
      type: "object",
      properties: {
        codigo: { type: "string", description: "Código da nova feature (ex.: 'F0.5')." },
        titulo: { type: "string", description: "Título curto da feature." },
        faseSlug: { type: "string", description: "Slug da fase onde criar (ex.: 'fase-0')." },
        descricao: { type: "string", description: "Descrição opcional." },
        dependeLM: { type: "boolean", description: "true se depende de algo do cliente LM." },
        areaDama: { type: "string", description: "Área DAMA (ex.: 'Metadata Management')." },
        status: {
          type: "string",
          enum: ["nao_iniciada", "em_andamento", "concluida", "bloqueada"],
          description: "Status inicial (padrão: nao_iniciada).",
        },
        checklist: {
          type: "array",
          items: { type: "string" },
          description: "Itens de checklist (entregáveis) iniciais, opcional.",
        },
      },
      required: ["codigo", "titulo", "faseSlug"],
    },
  },
  {
    name: "editar_feature",
    description:
      "Edita metadados de uma feature existente: título, descrição, dependeLM, área DAMA, ou renomeia o código. Não muda status (use definir_feature).",
    input_schema: {
      type: "object",
      properties: {
        codigo: { type: "string", description: "Código atual da feature (ex.: 'F0.5')." },
        novoCodigo: { type: "string", description: "Novo código, para renomear. Opcional." },
        titulo: { type: "string" },
        descricao: { type: "string" },
        dependeLM: { type: "boolean" },
        areaDama: { type: "string" },
      },
      required: ["codigo"],
    },
  },
  {
    name: "adicionar_item_checklist",
    description:
      "Adiciona um item de checklist (entregável) a uma feature existente. Use para detalhar o que precisa ser feito numa feature.",
    input_schema: {
      type: "object",
      properties: {
        featureCodigo: { type: "string", description: "Código da feature (ex.: 'F0.5')." },
        itemTexto: { type: "string", description: "Texto do item/entregável." },
        done: { type: "boolean", description: "Se já está concluído (padrão: false)." },
      },
      required: ["featureCodigo", "itemTexto"],
    },
  },
  {
    name: "marcar_checklist",
    description:
      "Marca um item de checklist de uma feature como concluído ou pendente. Use quando um entregável específico for finalizado ou reaberto.",
    input_schema: {
      type: "object",
      properties: {
        featureCodigo: { type: "string", description: "Código da feature (ex.: 'F0.1')." },
        itemTexto: {
          type: "string",
          description: "Texto (ou parte) do item de checklist. Match por substring, case-insensitive.",
        },
        done: { type: "boolean", description: "true = concluído; false = pendente." },
      },
      required: ["featureCodigo", "itemTexto", "done"],
    },
  },
  {
    name: "definir_stakeholder",
    description:
      "Cria ou atualiza um stakeholder do RACI (seção 3 da memória). Use ao identificar/confirmar quem é sponsor, owner de domínio, eng. de plataforma, etc.",
    input_schema: {
      type: "object",
      properties: {
        nome: { type: "string", description: "Nome da pessoa (se conhecido)." },
        papel: { type: "string", description: "Papel (ex.: 'Sponsor', 'Owner de domínio')." },
        lado: { type: "string", enum: ["LM", "Blite"], description: "De que lado está." },
        responsabilidade: { type: "string", description: "Responsabilidade no projeto." },
      },
      required: ["papel"],
    },
  },
  {
    name: "definir_baseline",
    description:
      "Cria ou atualiza uma métrica de baseline de adoção (seção 10). Use ao capturar valor inicial ou medição atual (usuários ativos, queries/semana, tabelas documentadas, etc.).",
    input_schema: {
      type: "object",
      properties: {
        metrica: { type: "string", description: "Nome da métrica." },
        valorInicial: { type: "string", description: "Valor inicial (baseline)." },
        atual: { type: "string", description: "Medição atual." },
        data: { type: "string", format: "date", description: "Data da medição (YYYY-MM-DD)." },
        fonte: { type: "string", description: "Fonte do dado." },
      },
      required: ["metrica"],
    },
  },
  {
    name: "avaliar_maturidade",
    description:
      "Registra/atualiza a avaliação de maturidade DAMA de UMA área da Roda (kit 08): nível atual e meta na escala 1–5 (Inicial..Otimizado), com status de verdade e proveniência. Use ao avaliar ou revisar a maturidade do LM numa área — alimenta o radar de maturidade do portal.",
    input_schema: {
      type: "object",
      properties: {
        area: {
          type: "string",
          enum: [...DAMA_AREAS],
          description: "Área da Roda DAMA (nome exato).",
        },
        nivelAtual: { type: "integer", minimum: 1, maximum: 5, description: "Nível atual do LM (1–5)." },
        nivelMeta: { type: "integer", minimum: 1, maximum: 5, description: "Nível-alvo (1–5). Meta padrão do projeto: 3 sustentável." },
        justificativa: { type: "string", description: "Evidências que sustentam a avaliação." },
        statusVerdade: {
          type: "string",
          enum: [...STATUS_VERDADE],
          description: "assumido enquanto não validado com o LM; confirmado após validação.",
        },
        proveniencia: { type: "string", description: "Fonte / quem confirmou / quando." },
      },
      required: ["area"],
    },
  },
  {
    name: "documentar_ativo",
    description:
      "Cria/atualiza uma entrada do CATÁLOGO (nível tabela, padrão Golden Example do kit 09): owner, grão, sensibilidade LGPD, lineage, qualidade. Aceita o dicionário de campos inline via `campos` — use para documentar a tabela inteira em uma chamada. Para ajustar um campo isolado depois, use documentar_campo.",
    input_schema: {
      type: "object",
      properties: {
        nome: { type: "string", description: "Nome completo do ativo (ex.: 'gold.vendas.fato_pedidos')." },
        camada: { type: "string", description: "Camada do lake (bronze/silver/gold/...)." },
        dominio: { type: "string", description: "Domínio de negócio (ex.: 'Vendas')." },
        descricao: { type: "string", description: "O que a tabela representa, em 1-2 frases." },
        owner: { type: "string", description: "Owner de domínio (quem valida)." },
        steward: { type: "string", description: "Steward/curador técnico." },
        grao: { type: "string", description: "Grão: o que é 1 linha (ex.: '1 linha = 1 item de pedido')." },
        atualizacao: { type: "string", description: "Frequência/janela de atualização (ex.: 'diária, D-1 às 6h')." },
        volumeAprox: { type: "string", description: "Volume aproximado (linhas/tamanho)." },
        sensibilidade: {
          type: "string",
          enum: [...SENSIBILIDADES],
          description: "Classificação LGPD da tabela (kit 06 §2.2).",
        },
        baseLegal: { type: "string", description: "Base legal LGPD — obrigatória quando sensibilidade é pessoal/pessoal_sensivel." },
        sistemasOrigem: { type: "string", description: "Sistemas de origem (ex.: 'ERP, e-commerce')." },
        tabelasRelacionadas: { type: "string", description: "Tabelas relacionadas (joins usuais)." },
        lineage: { type: "string", description: "Lineage em texto: origem → transformações → destino." },
        notasQualidade: { type: "string", description: "Regras/notas de qualidade conhecidas." },
        validadoPor: { type: "string", description: "Owner que validou a documentação." },
        validadoEm: { type: "string", format: "date", description: "Data da validação (YYYY-MM-DD)." },
        statusVerdade: {
          type: "string",
          enum: [...STATUS_VERDADE],
          description: "template (exemplo), assumido (não validado), confirmado (validado pelo owner), lacuna.",
        },
        proveniencia: { type: "string", description: "Fonte / quem informou / quando." },
        campos: {
          type: "array",
          description: "Dicionário de campos inline (opcional).",
          items: {
            type: "object",
            properties: {
              nome: { type: "string" },
              tipo: { type: "string", description: "Tipo do dado (string, int, date...)." },
              descricao: { type: "string" },
              regra: { type: "string", description: "Regra de negócio/cálculo." },
              dominioValores: { type: "string", description: "Domínio de valores (ex.: 'ATIVO|CANCELADO')." },
              nullable: { type: "boolean" },
              sensibilidade: { type: "string", enum: [...SENSIBILIDADES] },
            },
            required: ["nome"],
          },
        },
      },
      required: ["nome"],
    },
  },
  {
    name: "documentar_campo",
    description:
      "Cria/atualiza UM campo do dicionário de um ativo já catalogado (tipo, regra, domínio de valores, sensibilidade LGPD). O ativo precisa existir — senão, documente antes com documentar_ativo.",
    input_schema: {
      type: "object",
      properties: {
        assetNome: { type: "string", description: "Nome do ativo no catálogo (ex.: 'gold.vendas.fato_pedidos')." },
        nome: { type: "string", description: "Nome do campo." },
        tipo: { type: "string" },
        descricao: { type: "string" },
        regra: { type: "string", description: "Regra de negócio/cálculo." },
        dominioValores: { type: "string" },
        nullable: { type: "boolean" },
        sensibilidade: { type: "string", enum: [...SENSIBILIDADES] },
      },
      required: ["assetNome", "nome"],
    },
  },
  {
    name: "consultar_biblioteca",
    description:
      "Busca na Biblioteca — a base de conhecimento do portal (atas, planos, políticas LGPD, guias de catálogo/dicionário/acesso, mapeamentos de ownership que o Analista já produziu). Use SEMPRE que a pergunta puder ser respondida por esses documentos (processos, definições, políticas, decisões passadas) em vez de responder de memória. Retorna os documentos mais relevantes com um trecho e o id; use ler_documento para o conteúdo completo. Cite qual documento embasou a resposta.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Termos ou pergunta em linguagem natural (pt-BR)." },
        limite: { type: "integer", description: "Máximo de documentos a retornar (padrão 4, máx 8)." },
      },
      required: ["query"],
    },
  },
  {
    name: "ler_documento",
    description:
      "Lê o conteúdo COMPLETO de um documento da Biblioteca — por id (preferível, vindo de consultar_biblioteca) ou por título. Use quando o trecho da busca não bastar para responder ou citar com precisão.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "id do documento (retornado por consultar_biblioteca)." },
        titulo: { type: "string", description: "Título (ou parte dele), se não tiver o id." },
      },
    },
  },
  {
    name: "editar_memoria",
    description:
      "Atualiza uma seção de TEXTO LIVRE da memória do projeto (markdown). Use para resumo, premissas/pendências, próximas ações de curto prazo e glossário. Para dados estruturados (decisões, stack, fases, features, riscos, dependências, stakeholders, baseline) use as ferramentas específicas, não esta.",
    input_schema: {
      type: "object",
      properties: {
        secao: {
          type: "string",
          enum: [...MEMORIA_SECOES],
          description:
            "metadados | resumo | premissas | proximas_acoes | glossario.",
        },
        conteudo: { type: "string", description: "Conteúdo completo da seção, em markdown (substitui o anterior)." },
      },
      required: ["secao", "conteudo"],
    },
  },
];

type ToolInput = Record<string, unknown>;
const s = (v: unknown) => (v === undefined || v === null ? undefined : String(v));
const n = (v: unknown) => (v === undefined || v === null ? undefined : Number(v));
const b = (v: unknown) => Boolean(v);

export async function runNeroTool(name: string, input: ToolInput): Promise<string> {
  try {
    switch (name) {
      case "registrar_decisao": {
        const r = await recordDecision({
          decisao: String(input.decisao),
          porque: s(input.porque),
          quem: s(input.quem),
          faseSlug: s(input.faseSlug),
        });
        return `Decisão registrada (id ${r.id})${r.faseId ? " · ligada à fase" : ""}.`;
      }
      case "definir_stack": {
        const r = await setStackItem({
          item: String(input.item),
          resposta: s(input.resposta),
          statusVerdade: s(input.statusVerdade),
          proveniencia: s(input.proveniencia),
        });
        return `Stack "${r.item}" atualizado para status "${r.statusVerdade}".`;
      }
      case "atualizar_dependencia": {
        const r = await upsertDependency({
          codigo: String(input.codigo),
          descricao: s(input.descricao),
          solicitadoEm: s(input.solicitadoEm),
          status: s(input.status),
          trilhoParalelo: s(input.trilhoParalelo),
          decisaoPedida: s(input.decisaoPedida),
          faseSlug: s(input.faseSlug),
        });
        return `Dependência ${r.codigo} salva (status ${r.status}).`;
      }
      case "adicionar_risco": {
        const r = await addRisk({
          codigo: String(input.codigo),
          descricao: String(input.descricao),
          severidade: s(input.severidade),
          mitigacao: s(input.mitigacao),
          dono: s(input.dono),
          faseSlug: s(input.faseSlug),
          featureCodigo: s(input.featureCodigo),
        });
        return `Risco ${r.codigo} adicionado${r.featureId ? " (ligado a um epic)" : ""}.`;
      }
      case "definir_fase": {
        const r = await setPhase({
          fase: String(input.fase),
          rag: s(input.rag),
          pct: n(input.pct),
          comentario: s(input.comentario),
        });
        return `Fase "${r.fase}" → ${r.rag} (${r.pct}%).`;
      }
      case "definir_feature": {
        const r = await setFeatureStatus({
          codigo: String(input.codigo),
          status: String(input.status),
        });
        return `Feature ${r.codigo} → ${r.status}.`;
      }
      case "criar_feature": {
        const r = await createFeature({
          codigo: String(input.codigo),
          titulo: String(input.titulo),
          faseSlug: String(input.faseSlug),
          descricao: s(input.descricao),
          dependeLM: input.dependeLM === undefined ? undefined : b(input.dependeLM),
          areaDama: s(input.areaDama),
          status: s(input.status),
          checklist: Array.isArray(input.checklist) ? input.checklist.map(String) : undefined,
        });
        return `Feature ${r.codigo} criada: ${r.titulo}.`;
      }
      case "editar_feature": {
        const r = await editFeature({
          codigo: String(input.codigo),
          novoCodigo: s(input.novoCodigo),
          titulo: s(input.titulo),
          descricao: s(input.descricao),
          dependeLM: input.dependeLM === undefined ? undefined : b(input.dependeLM),
          areaDama: s(input.areaDama),
        });
        return `Feature ${r.codigo} editada.`;
      }
      case "adicionar_item_checklist": {
        const r = await addChecklistItem({
          featureCodigo: String(input.featureCodigo),
          itemTexto: String(input.itemTexto),
          done: input.done === undefined ? undefined : b(input.done),
        });
        return `Item "${r.texto.slice(0, 50)}" adicionado.`;
      }
      case "marcar_checklist": {
        const r = await toggleChecklistItemByText({
          featureCodigo: String(input.featureCodigo),
          itemTexto: String(input.itemTexto),
          done: b(input.done),
        });
        return `Checklist "${r.texto.slice(0, 50)}" → ${r.done ? "✓ concluído" : "pendente"}.`;
      }
      case "definir_stakeholder": {
        const r = await upsertStakeholder({
          nome: s(input.nome),
          papel: String(input.papel),
          lado: s(input.lado),
          responsabilidade: s(input.responsabilidade),
        });
        return `Stakeholder ${r.nome ? `${r.nome} ` : ""}(${r.papel}) salvo.`;
      }
      case "definir_baseline": {
        const r = await upsertBaselineMetric({
          metrica: String(input.metrica),
          valorInicial: s(input.valorInicial),
          atual: s(input.atual),
          data: s(input.data),
          fonte: s(input.fonte),
        });
        return `Baseline "${r.metrica}" salva.`;
      }
      case "avaliar_maturidade": {
        const r = await upsertMaturityAssessment({
          area: String(input.area),
          nivelAtual: n(input.nivelAtual),
          nivelMeta: n(input.nivelMeta),
          justificativa: s(input.justificativa),
          statusVerdade: s(input.statusVerdade),
          proveniencia: s(input.proveniencia),
        });
        return `Maturidade "${r.area}" → atual ${r.nivelAtual ?? "?"}, meta ${r.nivelMeta ?? "?"} (${r.statusVerdade}).`;
      }
      case "documentar_ativo": {
        const campos = Array.isArray(input.campos)
          ? (input.campos as Array<Record<string, unknown>>)
              .filter((c) => c && c.nome)
              .map((c) => ({
                nome: String(c.nome),
                tipo: s(c.tipo),
                descricao: s(c.descricao),
                regra: s(c.regra),
                dominioValores: s(c.dominioValores),
                nullable: c.nullable === undefined ? undefined : b(c.nullable),
                sensibilidade: s(c.sensibilidade),
              }))
          : undefined;
        const r = await upsertCatalogAsset({
          nome: String(input.nome),
          camada: s(input.camada),
          dominio: s(input.dominio),
          descricao: s(input.descricao),
          owner: s(input.owner),
          steward: s(input.steward),
          grao: s(input.grao),
          atualizacao: s(input.atualizacao),
          volumeAprox: s(input.volumeAprox),
          sensibilidade: s(input.sensibilidade),
          baseLegal: s(input.baseLegal),
          sistemasOrigem: s(input.sistemasOrigem),
          tabelasRelacionadas: s(input.tabelasRelacionadas),
          lineage: s(input.lineage),
          notasQualidade: s(input.notasQualidade),
          validadoPor: s(input.validadoPor),
          validadoEm: s(input.validadoEm),
          statusVerdade: s(input.statusVerdade),
          proveniencia: s(input.proveniencia),
          campos,
        });
        return `Ativo "${r.nome}" documentado no catálogo (${r.statusVerdade})${campos?.length ? ` com ${campos.length} campos` : ""}.`;
      }
      case "documentar_campo": {
        const r = await upsertDataField({
          assetNome: String(input.assetNome),
          nome: String(input.nome),
          tipo: s(input.tipo),
          descricao: s(input.descricao),
          regra: s(input.regra),
          dominioValores: s(input.dominioValores),
          nullable: input.nullable === undefined ? undefined : b(input.nullable),
          sensibilidade: s(input.sensibilidade),
        });
        return `Campo ${input.assetNome}.${r.nome} documentado.`;
      }
      case "consultar_biblioteca": {
        const hits = await searchBiblioteca(String(input.query), n(input.limite) ?? 4);
        if (!hits.length)
          return "Nenhum documento da Biblioteca casou com a busca. Responda com o que souber e sinalize que não há documento cobrindo isso.";
        return (
          `Documentos da Biblioteca relevantes (cite o(s) que usar):\n` +
          hits
            .map((h) => `- [${h.tipo} · ${h.statusVerdade}] ${h.titulo} (id: ${h.id})\n  «${h.trecho}»`)
            .join("\n")
        );
      }
      case "ler_documento": {
        const doc = await readDocumentForNero({ id: s(input.id), titulo: s(input.titulo) });
        if (!doc)
          return "Documento não encontrado. Use consultar_biblioteca para localizar o id correto.";
        const MAX = 8000;
        const body =
          doc.conteudo.length > MAX
            ? doc.conteudo.slice(0, MAX) + "\n\n…(conteúdo truncado)"
            : doc.conteudo;
        return `# ${doc.titulo}\n(tipo: ${doc.tipo} · status de verdade: ${doc.statusVerdade})\n\n${body}`;
      }
      case "editar_memoria": {
        const r = await upsertProjectNote({
          secao: String(input.secao),
          conteudo: String(input.conteudo),
        });
        return `Memória "${r.secao}" atualizada.`;
      }
      default:
        return `Tool desconhecida: ${name}`;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "erro";
    return `Falha ao executar ${name}: ${msg}`;
  }
}
