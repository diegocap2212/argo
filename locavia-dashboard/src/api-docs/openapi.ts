// Spec OpenAPI 3.1 da API do locavia-dashboard (Vercel Serverless Functions em /api).
// Mantida à mão como objeto TS (passada direto ao Swagger UI → continua atrás do login,
// sem arquivo público). Ao mudar um endpoint em api/*, atualize o contrato correspondente aqui.

export const openApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'Locavia Dashboard API',
    version: '1.0.0',
    description:
      'Endpoints serverless do dashboard (Vercel Functions em `/api`). A maioria exige sessão '
      + '(cookie HttpOnly `dash_session`, HMAC, 12h) obtida em `POST /api/login`. As chamadas same-origin '
      + 'da própria SPA enviam o cookie automaticamente — use "Try it out" já autenticado no painel.',
  },
  servers: [{ url: '/', description: 'Mesma origem (SPA + funções)' }],
  tags: [
    { name: 'Auth', description: 'Login / sessão' },
    { name: 'Dados', description: 'Dataset do Jira' },
    { name: 'Análises', description: 'Comentários qualitativos (gaps/ações)' },
    { name: 'Sync', description: 'Sincronização do Jira (GitHub Actions)' },
  ],
  components: {
    securitySchemes: {
      sessionCookie: {
        type: 'apiKey',
        in: 'cookie',
        name: 'dash_session',
        description: 'Cookie de sessão HttpOnly assinado por HMAC (obtido em POST /api/login).',
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
  // Por padrão, tudo exige sessão; endpoints públicos sobrescrevem com `security: []`.
  security: [{ sessionCookie: [] }],
  paths: {
    '/api/login': {
      get: {
        tags: ['Auth'], summary: 'Estado da sessão', security: [],
        responses: {
          200: {
            description: 'Estado atual',
            content: { 'application/json': { schema: { type: 'object', properties: { authenticated: { type: 'boolean' }, configured: { type: 'boolean' } } } } },
          },
        },
      },
      post: {
        tags: ['Auth'], summary: 'Login com senha única', security: [],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['password'], properties: { password: { type: 'string' } } } } },
        },
        responses: {
          200: { description: 'Autenticado — seta cookie dash_session', content: { 'application/json': { schema: { type: 'object', properties: { ok: { type: 'boolean' } } } } } },
          401: { description: 'Senha incorreta', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          429: { description: 'Rate-limit (8 tentativas / 15 min por IP)', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          503: { description: 'Login não configurado', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
      delete: {
        tags: ['Auth'], summary: 'Logout (limpa o cookie)', security: [],
        responses: { 200: { description: 'Sessão encerrada', content: { 'application/json': { schema: { type: 'object', properties: { ok: { type: 'boolean' } } } } } } },
      },
    },
    '/api/data': {
      get: {
        tags: ['Dados'], summary: 'Dataset do Jira (itens + syncedAt)',
        description: 'Retorna ~5MB de itens. Suporta ETag/304 e `Cache-Control: max-age=300`.',
        responses: {
          200: {
            description: 'Dataset',
            content: { 'application/json': { schema: { type: 'object', properties: { items: { type: 'array', items: { $ref: '#/components/schemas/JiraItem' } }, syncedAt: { type: ['string', 'null'], format: 'date-time' } } } } },
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
          400: { description: 'Campos obrigatórios faltando', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          401: { description: 'Não autenticado', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/api/refresh': {
      get: {
        tags: ['Sync'], summary: 'Status da última execução de sync (GitHub Actions)',
        responses: {
          200: { description: 'Status', content: { 'application/json': { schema: { type: 'object', properties: { status: { type: 'string', enum: ['queued', 'in_progress', 'completed', 'unknown'] }, conclusion: { type: ['string', 'null'] }, createdAt: { type: 'string' }, url: { type: 'string' } } } } } },
          401: { description: 'Não autenticado', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
      post: {
        tags: ['Sync'], summary: 'Dispara o sync do Jira (workflow_dispatch)',
        responses: {
          202: { description: 'Disparado (ou já em andamento)', content: { 'application/json': { schema: { type: 'object', properties: { ok: { type: 'boolean' }, alreadyRunning: { type: 'boolean' }, message: { type: 'string' } } } } } },
          401: { description: 'Não autenticado', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          503: { description: 'Refresh não configurado (faltam GITHUB_DISPATCH_TOKEN/GITHUB_REPO)', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/api/trigger-sync': {
      post: {
        tags: ['Sync'], summary: 'Dispara o sync via cron externo (auth por CRON_SECRET)',
        description: 'Não usa sessão; valida `CRON_SECRET` na query `?key=` ou no header `x-cron-key`.',
        security: [],
        parameters: [{ name: 'key', in: 'query', schema: { type: 'string' }, description: 'CRON_SECRET (alternativa ao header x-cron-key)' }],
        responses: {
          200: { description: 'Disparado', content: { 'application/json': { schema: { type: 'object', properties: { ok: { type: 'boolean' }, dispatched: { type: 'boolean' }, at: { type: 'string', format: 'date-time' } } } } } },
          401: { description: 'Unauthorized (CRON_SECRET inválido)', content: { 'application/json': { schema: { type: 'object', properties: { ok: { type: 'boolean' }, error: { type: 'string' } } } } } },
          500: { description: 'Falta GITHUB_DISPATCH_TOKEN' },
          502: { description: 'Falha no dispatch ao GitHub' },
        },
      },
    },
  },
} as const;

export default openApiSpec;
