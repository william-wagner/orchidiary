# Orchidiary

Guia de cultivo e diário das suas orquídeas. Site mobile first (PWA), no ar em [orchidiary.com](https://orchidiary.com) e acessado pelo celular ou pelo navegador do PC.

- **Guia de Cultivo**: catálogo em árvore (família → gênero → espécie → variedade, mais híbridos e cultivares) com fichas de faixas ideais de temperatura, umidade, luz, rega, substrato e floração; o que um táxon não tiver é herdado do nível acima.
- **Diário**: cada planta (indivíduo) tem fotos, eventos (rega, adubação, floração…), medições manuais de temperatura e umidade e o **clima diário** do lugar onde ela está, tudo numa linha do tempo.

## Como rodar

Pré-requisitos: Node 22+, pnpm 10+, Docker (para o Postgres) e Tailscale (para abrir no celular com HTTPS).

```bash
cp .env.example .env          # ajuste e-mail/senha do master e gere a SECRETS_KEY
pnpm install
pnpm db:up                    # sobe o Postgres no Docker
pnpm db:migrate               # aplica as migrações de apps/api/drizzle/
pnpm db:seed                  # cria o usuário master e o catálogo de táxons do guia
pnpm db:seed:demo             # opcional: planta FAKE com um ano de fotos, eventos e clima real
pnpm dev                      # API na 8787 + app web na 5173
```

Abra `http://localhost:5173` no PC.

Mudou o schema do banco? `pnpm db:generate` cria a migração; faça commit dela em `apps/api/drizzle/`.

### No celular (HTTPS via Tailscale)

Câmera e GPS só funcionam no navegador em conexões HTTPS. Com o Tailscale ativo no PC e no celular:

```bash
tailscale serve --bg 5173     # em desenvolvimento
```

O Tailscale mostra um endereço `https://<seu-pc>.<tailnet>.ts.net`. Coloque esse endereço em `WEB_ORIGIN` no `.env` (é usado no login do Google Drive) e reinicie a API. No celular, abra o endereço e use "Adicionar à tela inicial" para instalar como app.

### Produção local sem Docker

```bash
pnpm build
# no .env: NODE_ENV=production
pnpm --filter @orchidiary/api start   # a API serve também o app web na 8787
tailscale serve --bg 8787
```

### Docker (o mesmo arranjo da produção)

Sobe o Postgres, o app (API + app web) e o Caddy juntos, sem precisar de Node na máquina:

```bash
cp .env.example .env          # ajuste e-mail/senha do master e a SECRETS_KEY
docker compose up -d --build  # app em https://localhost, pelo Caddy
```

O app não publica a 8787 no host: só o Caddy chega nele. Com `APP_DOMAIN=localhost` o Caddy usa um certificado da CA interna dele, e o navegador avisa na primeira visita.

A cada início o container aplica as migrações e roda o seed (idempotente: não troca a senha de quem já existe). `DATABASE_URL`, `NODE_ENV`, `STORAGE_DIR`, `LOG_DIR` e `TRUST_PROXY` do `.env` são sobrescritos pelo `docker-compose.yml`; fotos e logs ficam em `apps/api/data/`. Para atualizar depois de mudar o código: `docker compose up -d --build app`. Logs: `docker compose logs -f app`.

### Produção (orchidiary.com)

Roda na AWS (Lightsail, São Paulo) com o mesmo `docker-compose.yml`. Cada push na `main` dispara o deploy pelo GitHub Actions: o runner entra na tailnet, acessa a VM por SSH e roda `docker compose up -d --build`. Detalhes em [docs/INFRASTRUCTURE.md](docs/INFRASTRUCTURE.md).

## Estrutura

```
apps/api        API (Hono + Drizzle + Postgres), rotinas agendadas
apps/web        App web (React + Vite + Tailwind, PWA)
packages/shared Tipos, validações (Zod) e regras puras usadas pelos dois lados
docs/           Arquitetura, infraestrutura e roadmap
```

## Testes

```bash
pnpm test
```

Veja [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) para as regras de negócio, [docs/INFRASTRUCTURE.md](docs/INFRASTRUCTURE.md) para os ambientes local e AWS e [docs/ROADMAP.md](docs/ROADMAP.md) para as próximas etapas.
