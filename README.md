# Orchidiary

Guia de cultivo e diário das suas orquídeas. Site mobile first (PWA), hospedado no seu próprio computador e acessado pelo celular ou pelo navegador do PC.

- **Guia de Cultivo**: uma ficha por espécie/gênero com faixas ideais de temperatura, umidade, luz, rega, substrato e floração.
- **Diário**: cada planta (indivíduo) tem fotos, eventos (rega, adubação, floração…), medições manuais de temperatura e umidade e o **clima diário** do lugar onde ela está, tudo numa linha do tempo.

## Como rodar

Pré-requisitos: Node 22+, pnpm 10+, Docker (para o Postgres) e Tailscale (para abrir no celular com HTTPS).

```bash
cp .env.example .env          # ajuste e-mail/senha do master e gere a SECRETS_KEY
pnpm install
pnpm db:up                    # sobe o Postgres no Docker
pnpm db:generate              # gera a migração inicial a partir do schema
pnpm db:migrate
pnpm db:seed                  # cria o usuário master e as primeiras fichas do guia
pnpm dev                      # API na 8787 + app web na 5173
```

Abra `http://localhost:5173` no PC.

### No celular (HTTPS via Tailscale)

Câmera e GPS só funcionam no navegador em conexões HTTPS. Com o Tailscale ativo no PC e no celular:

```bash
tailscale serve --bg 5173     # em desenvolvimento
```

O Tailscale mostra um endereço `https://<seu-pc>.<tailnet>.ts.net`. Coloque esse endereço em `WEB_ORIGIN` no `.env` (é usado no login do Google Drive) e reinicie a API. No celular, abra o endereço e use "Adicionar à tela inicial" para instalar como app.

### Produção (uso diário)

```bash
pnpm build
# no .env: NODE_ENV=production
pnpm --filter @orchidiary/api start   # a API serve também o app web na 8787
tailscale serve --bg 8787
```

### Produção com Docker

Sobe o Postgres e o app (API + app web) juntos, sem precisar de Node na máquina:

```bash
cp .env.example .env          # ajuste e-mail/senha do master e a SECRETS_KEY
docker compose up -d --build  # app em http://localhost:8787
tailscale serve --bg 8787
```

A cada início o container aplica as migrações e roda o seed (idempotente: não troca a senha de quem já existe). `DATABASE_URL`, `NODE_ENV`, `STORAGE_DIR` e `LOG_DIR` do `.env` são sobrescritos pelo `docker-compose.yml`; fotos e logs ficam em `apps/api/data/` no PC. Para atualizar depois de mudar o código: `docker compose up -d --build app`. Logs: `docker compose logs -f app`.

## Estrutura

```
apps/api        API (Hono + Drizzle + Postgres), rotinas agendadas
apps/web        App web (React + Vite + Tailwind, PWA)
packages/shared Tipos, validações (Zod) e regras puras usadas pelos dois lados
docs/           Arquitetura, decisões e roadmap
```

## Testes

```bash
pnpm test
```

Veja [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) para as regras de negócio e [docs/ROADMAP.md](docs/ROADMAP.md) para as próximas etapas.
