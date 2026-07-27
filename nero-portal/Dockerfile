# ⚠️ NÃO VERIFICADO — ESTE ARQUIVO NUNCA FOI BUILDADO COM SUCESSO.
#
# Imagem portável do Portal Nero, para o self-host na infra da Blite (cenários (b)/(c) do
# blueprint enterprise). Na Vercel ela NÃO é usada: o deploy é nativo (Next.js).
#
# ESTADO: corrigido estruturalmente em 2026-07-27, mas SEM build de validação — não havia
# Docker no ambiente. Trate como rascunho revisado, não como caminho de deploy pronto.
# `docs/ARQUITETURA-ENTERPRISE.md` não deve afirmar que o container está pronto até que
# `docker build -f nero-portal/Dockerfile .` (da RAIZ do monorepo) passe e a imagem suba.
#
# O QUE ESTAVA ERRADO ANTES (tudo verificado no repo, não hipotético):
#   1. `COPY package.json package-lock.json` — não existe package-lock.json neste repo desde
#      a migração para pnpm workspaces (commit c5393c2). O build quebrava na 1ª camada.
#   2. `RUN npm ci` num workspace pnpm.
#   3. O contexto assumido era `nero-portal/`, que não alcança a raiz nem
#      `packages/neo-auth`, de onde vem `@neo/auth` (`workspace:*`, transpilado pelo
#      next.config.ts). Sem a raiz, o build não tem como resolver o pacote.
#   4. `COPY /app/public ./public` — `nero-portal/public/` não existe.
#   5. `CMD ... prisma db push && node server.js` — aplicava schema no START do container.
#      Isto contradiz DIRETAMENTE a correção do incidente em que um deploy de preview tocou
#      o banco de produção. Migration é passo de deploy deliberado, nunca efeito colateral
#      de subir um container. Ver `pnpm --filter nero-portal db:migrate` (prisma migrate
#      deploy) e a nota no runner.
#
# CONTEXTO DE BUILD: a RAIZ do monorepo (precisa do lockfile e de packages/neo-auth).
#   docker build -f nero-portal/Dockerfile -t nero-portal .

# --- base: pnpm via corepack (lê `packageManager` da raiz) ---
FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo

# --- deps: só os manifestos, para a camada de install cachear ---
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/neo-auth/package.json packages/neo-auth/
COPY nero-portal/package.json nero-portal/
# O schema entra ANTES do install: o `postinstall` do nero-portal roda `prisma generate`,
# que falha sem prisma/schema.prisma (@prisma/client está em allowBuilds no workspace).
COPY nero-portal/prisma nero-portal/prisma
# `--filter nero-portal...` traz o app e suas dependências de workspace (@neo/auth),
# sem instalar o Dash, o hub e o Maturity.
RUN pnpm install --frozen-lockfile --filter nero-portal...

# --- builder: código + build do Next (saída standalone) ---
FROM deps AS builder
COPY packages/neo-auth packages/neo-auth
COPY nero-portal nero-portal
RUN pnpm --filter nero-portal build

# --- runner: imagem final enxuta ---
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
WORKDIR /app

# A saída standalone de um monorepo preserva a árvore: o entrypoint é nero-portal/server.js
# e o node_modules podado fica na raiz do standalone.
COPY --from=builder /repo/nero-portal/.next/standalone ./
COPY --from=builder /repo/nero-portal/.next/static ./nero-portal/.next/static
# Sem `public/`: o diretório não existe neste app (os assets vivem no hub do portal).

# Prisma (schema + engines) fica na imagem para permitir rodar migration como um passo
# EXPLÍCITO e separado — nunca no CMD:
#   docker run --rm --entrypoint sh nero-portal -c "npx prisma migrate deploy"
COPY --from=builder /repo/nero-portal/prisma ./nero-portal/prisma

USER node
EXPOSE 3000

# Só sobe o servidor. O schema do banco é responsabilidade do pipeline de deploy.
CMD ["node", "nero-portal/server.js"]
