# Orchidiary — notas para o Claude

- Idioma do produto, da interface e dos textos: português do Brasil. Código e nomes técnicos em inglês.
- Monorepo pnpm: `apps/api` (Hono + Drizzle + Postgres), `apps/web` (React + Vite + Tailwind 4, PWA), `packages/shared` (Zod e regras puras).
- Imports locais com extensão `.ts`/`.tsx` (rodamos com tsx e `allowImportingTsExtensions`).
- Regras de negócio puras vão para `packages/shared` e ganham teste (`node:test` via `tsx --test`).
- **Nunca** altere coordenadas de `plant_locations` existentes nem apague clima de períodos passados: mudança de local fecha o período atual e cria outro (ver docs/ARCHITECTURE.md).
- Espécies vivem em `taxa` (árvore autorrelacionada por `parent_id`); a planta pode apontar para qualquer nível. Regras de nível, nome e herança de ficha em `packages/shared/src/taxonomy.ts`. Novos táxons do catálogo inicial vão em `apps/api/src/db/catalog.ts` (o teste valida a árvore); os países de origem das espécies vão em `catalogOrigins.ts` (principal em `byCountry`, demais em `alsoIn`). Países novos: acrescentar em `ORIGIN_COUNTRIES` (shared) e na lista do glob de `OriginFlag.tsx` (um teste confere).
- Rotas de integração e backup (`/api/settings/*`) são exclusivas do usuário master.
- Segredos de integrações só via `saveIntegration` (criptografados com `SECRETS_KEY`); nunca devolva segredos para o front.
- Mudou o schema? Rode `pnpm db:generate` e faça commit da migração em `apps/api/drizzle/`.
- Design: identidade "Caderno botânico" (caderno de campo claro, tinta verde-floresta, acentos de orquídea). Tokens em `apps/web/src/styles.css`: papel, folha, tinta, musgo (texto auxiliar), folhagem, sálvia, linha, contorno, lilás e orquídea (links e destaques de flor), ocre, alerta, fita, prancha.
  - Tipografia: Gelasio (serifa) para títulos e nomes científicos; Inter para o corpo; IBM Plex Mono (classes `typed` e `eyebrow`) para dados de campo: datas, locais, medições, números de tombo.
  - Nomes científicos sempre com a classe `taxon` (itálico). Datas no formato de etiqueta (14.X.2026) via `typedDate`.
  - Elementos: `cartao` (página clara), `selo` (+ `selo-flor`, `selo-ocre`, `selo-alerta`), `fixada` (foto presa com fita), `leader` (pontilhado), `chave` (interruptor), ícones de traço em `Icon` (ui.tsx).
  - Logo: o Relógio (`components/Logo.tsx` e `public/icon.svg`); as cores dele são as variáveis `--logo-*`. Mudou o SVG do ícone? Regere `icon-192.png` e `icon-512.png`.
