# Imagem portável do Portal Nero (para a infra da Blite no futuro).
# Na Vercel este arquivo NÃO é usado — o deploy é nativo (Next.js).
# Usa a saída "standalone" do Next (ver next.config.ts).

# --- deps: instala dependências ---
FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# --- builder: gera o client Prisma e builda o Next ---
FROM node:20-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

# --- runner: imagem final enxuta ---
FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# App standalone + estáticos
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Prisma (schema + CLI + engines) para aplicar o schema no start
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

EXPOSE 3000

# No start: aplica o schema no banco (DATABASE_URL/DIRECT_URL via env) e sobe o server.
CMD ["sh", "-c", "node node_modules/prisma/build/index.js db push && node server.js"]
