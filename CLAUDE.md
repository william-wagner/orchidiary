# Orchidiary — notas para o Claude

- Idioma do produto, da interface e dos textos: português do Brasil. Código e nomes técnicos em inglês.
- Monorepo pnpm: `apps/api` (Hono + Drizzle + Postgres), `apps/web` (React + Vite + Tailwind 4, PWA), `packages/shared` (Zod e regras puras).
- Imports locais com extensão `.ts`/`.tsx` (rodamos com tsx e `allowImportingTsExtensions`).
- Regras de negócio puras vão para `packages/shared` e ganham teste (`node:test` via `tsx --test`).
- **Nunca** altere coordenadas de `plant_locations` existentes nem apague clima de períodos passados: mudança de local fecha o período atual e cria outro (ver docs/ARCHITECTURE.md).
- Rotas de integração e backup (`/api/settings/*`) são exclusivas do usuário master.
- Segredos de integrações só via `saveIntegration` (criptografados com `SECRETS_KEY`); nunca devolva segredos para o front.
- Mudou o schema? Rode `pnpm db:generate` e faça commit da migração em `apps/api/drizzle/`.
- Design: paleta botânica definida em `apps/web/src/styles.css`; nomes científicos com a classe `taxon` (itálico).
