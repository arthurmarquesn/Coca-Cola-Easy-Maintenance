# Imagem de produção do site (Next.js standalone).
# Build: docker compose --env-file .env.production -f docker-compose.prod.yml build web

FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:20-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# src/lib/db.ts e src/lib/auth.ts validam estas variáveis ao
# carregar. Os valores abaixo existem só durante o build (não
# conectam em nada e não vão para a imagem final); os reais
# vêm do .env.production em tempo de execução.
RUN DB_HOST=build-only \
    DB_USER=build-only \
    DB_NAME=build-only \
    AUTH_SECRET=build-only-placeholder-not-a-real-secret-000000 \
    npm run build

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
# Cadastro do primeiro Analista:
#   docker compose ... exec web node scripts/create-user.mjs ...
# bcryptjs e mysql2 já vêm no node_modules rastreado do standalone.
COPY --from=build --chown=node:node /app/scripts/create-user.mjs ./scripts/create-user.mjs

USER node
EXPOSE 3000

CMD ["node", "server.js"]
