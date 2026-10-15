# Orchidiary: API (Hono) servindo também o build do app web, numa única porta.
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /app

# Dependências (camada cacheada enquanto os package.json e o lockfile não mudam)
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# Build do app web
FROM deps AS web-build
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN pnpm --filter @orchidiary/web build

# Imagem final: a API roda com tsx (imports .ts), então leva as dependências completas
FROM deps AS runtime
ENV NODE_ENV=production
COPY packages/shared packages/shared
COPY apps/api apps/api
COPY --from=web-build /app/apps/web/dist apps/web/dist
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh
WORKDIR /app/apps/api
EXPOSE 8787
ENTRYPOINT ["entrypoint.sh"]
CMD ["node", "--import", "tsx", "src/index.ts"]
