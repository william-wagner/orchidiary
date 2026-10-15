# Orchidiary — notas para o Claude

- Idioma do produto, da interface e dos textos: português do Brasil. Código e nomes técnicos em inglês.
- Monorepo pnpm: `apps/api` (Hono + Drizzle + Postgres), `apps/web` (React + Vite + Tailwind 4, PWA), `packages/shared` (Zod e regras puras).
- Imports locais com extensão `.ts`/`.tsx` (rodamos com tsx e `allowImportingTsExtensions`).
- Regras de negócio puras vão para `packages/shared` e ganham teste (`node:test` via `tsx --test`).
- **Nunca** altere coordenadas de `plant_locations` existentes nem apague clima de períodos passados: mudança de local fecha o período atual e cria outro (ver docs/ARCHITECTURE.md).
- Rotas de integração e backup (`/api/settings/*`) são exclusivas do usuário master.
- Segredos de integrações só via `saveIntegration` (criptografados com `SECRETS_KEY`); nunca devolva segredos para o front.
- Mudou o schema? Rode `pnpm db:generate` e faça commit da migração em `apps/api/drizzle/`.
- Design: identidade "Herbário" (cada planta é uma exsicata catalogada). Tokens em `apps/web/src/styles.css`: papel, etiqueta, sépia, tinta, carimbo (violeta, ações e destaques), prensada, kraft, fita.
  - Tipografia: EB Garamond para textos; Courier Prime (classe `typed`) só para dados de coleta: datas, locais, medições, números de tombo.
  - Nomes científicos sempre com a classe `taxon` (itálico). Datas no formato de etiqueta (14.X.2026) via `typedDate`.
  - Elementos da linguagem: `herb-label` (etiqueta), `stamp` (carimbo), `mounted` (foto presa com fita), `leader` (pontilhado), registro térmico em quadradinhos.
