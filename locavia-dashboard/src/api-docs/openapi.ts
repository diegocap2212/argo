// Spec OpenAPI 3.1 da API do locavia-dashboard (Vercel Serverless Functions em /api).
// Mantida à mão como objeto TS (passada direto ao Swagger UI → continua atrás do login,
// sem arquivo público). Ao mudar um endpoint em api/*, atualize o contrato correspondente aqui.

export const openApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'NEO — API do Dash',
    version: '2.0.0',
    description:
      'Endpoints serverless do portal NEO (Vercel Functions em `/api`). O login acontece no hub '
      + '(OTP Supabase) → cookie `neo_session` (HMAC, 12h) emitido por `POST /api/session` na raiz; '
      + 'o middleware Edge exige esse cookie para o HTML/assets de `/dash` e `/maturity`. Já as functions '
      + 'sob `/api` autorizam pelo **JWT do Supabase** (`Authorization: Bearer <access_token>`) validado '
      + 'contra a allowlist NEO (`is_neo_allowed`). A SPA envia o Bearer automaticamente — use "Try it out" '
      + 'já logado no painel.',
  },
  servers: [{ url: '/', description: 'Mesma origem (SPA + funções)' }],
  tags: [
    { name: 'Dados', description: 'Dataset do Jira' },
    { name: 'Análises', description: 'Comentários qualitativos (gaps/ações)' },
    { name: 'Sync', description: 'Sincronização do Jira (GitHub Actions)' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Access token do Supabase (sessão do usuário logado no hub), validado contra a allowlist NEO.',
      },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: { error: { type: 'string' } },
        example: { error: 'Não autenticado.' },
      },
      JiraItem: {
        type: 'object',
        properties: {
          Type: { type: 'string', example: 'História' },
          Key: { type: 'string', example: 'VAA-123' },
          Summary: { type: 'string' },
          Status: { type: 'string', example: 'EM ANDAMENTO' },
          StatusCategory: { type: 'string', enum: ['TODO', 'IN_PROGRESS', 'DONE'] },
          Team: { type: 'string' },
          Created: { type: 'string', description: 'Data (YYYY-MM-DD ou timestamp Excel)' },
          Resolved: { type: ['string', 'null'] },
          UpdatedAt: { type: 'string' },
          Release: { type: 'string', example: 'O4R1' },
          StoryPoints: { type: ['number', 'null'] },
          Labels: { type: 'array', items: { type: 'string' } },
          CommitmentDate: { type: ['string', 'null'] },
          StartDate: { type: ['string', 'null'] },
        },
      },
    },
  },
  // Por padrão, tudo exige o Bearer do Supabase; endpoints públicos sobrescrevem com `security: []`.
  security: [{ bearerAuth: [] }],
  paths: {
    '/api/data': {
      get: {
        tags: ['Dados'], summary: 'Dataset do Jira (itens + procedência)',
        description:
          'Retorna ~5MB de itens. Suporta ETag/304 e `Cache-Control: max-age=300`.\n\n' +
          '`source` diz de onde o dado veio: `blob` (publicado pelo sync) ou `fallback` ' +
          '(snapshot congelado no repositório, servido quando o Blob falha). Quando ' +
          '`stale: true`, `syncedAt` é `null` — o dataset não carrega data própria e o ' +
          'endpoint NÃO empresta o timestamp do último sync para fingir frescor.',
        responses: {
          200: {
            description: 'Dataset',
            content: { 'application/json': { schema: { type: 'object', properties: {
              items: { type: 'array', items: { $ref: '#/components/schemas/JiraItem' } },
              syncedAt: { type: ['string', 'null'], format: 'date-time', description: 'Do dataset servido; null quando desconhecido.' },
              source: { type: 'string', enum: ['blob', 'fallback'] },
              stale: { type: 'boolean' },
              count: { type: 'integer' },
              hash: { type: ['string', 'null'], description: 'Impressão digital do conteúdo, gravada pelo sync.' },
            } } } },
          },
          304: { description: 'Not Modified (ETag bate)' },
          401: { description: 'Não autenticado', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/api/comments': {
      get: {
        tags: ['Análises'], summary: 'Árvore de análises por cadência',
        parameters: [{ name: 'cadence', in: 'query', schema: { type: 'string', enum: ['quinzena', 'semana'], default: 'quinzena' }, description: 'Define o hash Redis (quinzena=v2, semana=v3).' }],
        responses: {
          200: { description: 'Árvore aninhada [squadId][releaseId][periodId][metricId]', content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } } },
          401: { description: 'Não autenticado', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
      post: {
        tags: ['Análises'], summary: 'Salva uma análise (HSET atômico de um campo)',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['squadId', 'releaseId', 'quinzenaId', 'metricId'], properties: {
            squadId: { type: 'string' }, releaseId: { type: 'string' },
            quinzenaId: { type: 'string', description: 'periodId (quinzena ou semana)' },
            metricId: { type: 'string' }, gap: { type: 'string' }, action: { type: 'string' },
            cadence: { type: 'string', enum: ['quinzena', 'semana'] },
          } } } },
        },
        responses: {
          200: { description: 'Salvo', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, updatedAt: { type: 'string', format: 'date-time' } } } } } },
          400: { description: 'Identificadores inválidos/faltando (string ≤200) ou gap/action >4000 chars', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          401: { description: 'Não autenticado', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    // `/api/refresh` e `/api/trigger-sync` foram REMOVIDOS em 2026-07-27. Eram superfície
    // morta: nenhum frontend os chamava, as envs `CRON_SECRET`/`GITHUB_*` nunca existiram no
    // projeto neo-lm (ver HANDOFF), e o sync roda por cron nativo do GitHub Actions. Além de
    // inúteis, carregavam dois defeitos: `refresh` era fail-open quando as envs do Supabase
    // faltavam (sem branch de produção, diferente de todas as outras functions), e
    // `trigger-sync` aceitava o segredo em query string — formato que vaza em log, histórico
    // do browser e header Referer.
  },
} as const;

export default openApiSpec;
