# Infraestrutura

Como o Orchidiary roda hoje: no PC (desenvolvimento e uso local) e na AWS (produção). As regras de negócio estão em [ARCHITECTURE.md](ARCHITECTURE.md).

> Estado levantado em 19.X.2026 (dados da VM lidos por SSH). Itens marcados com **(a confirmar)** só aparecem no console do Lightsail.

## Visão geral

```
                         ┌──────────────── Lightsail 2 GB, sa-east-1 (São Paulo) ───────────┐
Celular / PC ──HTTPS──▶  │  caddy :80/:443 ──▶ app :8787 (API Hono + app web) ──▶ db :5432   │
 orchidiary.com          │  Let's Encrypt        │  └─ ./apps/api/data (fotos e logs)          │
                         └───────────────────────┼──────────────────────────────────────────┘
                                                 ├─▶ Open-Meteo (clima)
GitHub Actions ──Tailscale + SSH──▶ VM           ├─▶ Telegram Bot API (alertas)
  (push na main)                                 └─▶ Google Drive API (backup semanal)
```

O mesmo `docker-compose.yml` serve aos dois ambientes; o que muda é o `.env` de cada máquina.

## Peças comuns

### Imagem do app (`Dockerfile`)

Multi-stage sobre `node:22-bookworm-slim`, com pnpm via corepack:

1. `deps`: instala as dependências do monorepo (`pnpm install --frozen-lockfile`, com cache do store).
2. `web-build`: `pnpm --filter @orchidiary/web build` gera `apps/web/dist`.
3. `runtime`: leva `packages/shared`, `apps/api` e o `dist` do web. A API roda com `node --import tsx src/index.ts` (imports `.ts`, por isso as dependências completas vão junto) e serve também o app web, numa única porta (8787).

Ao iniciar, `docker/entrypoint.sh` roda as migrações (`src/db/migrate.ts`) e o seed (`src/db/seed.ts`). Os dois são idempotentes: o seed só garante o usuário master (sem trocar a senha de quem já existe) e insere as fichas do catálogo que ainda faltam.

### Serviços (`docker-compose.yml`)

| Serviço | Imagem | Portas | Persistência |
|---|---|---|---|
| `db` | `postgres:17-alpine` | nenhuma publicada (só a rede interna do Docker) | volume `pgdata` |
| `app` | build do `Dockerfile` | `expose 8787`, só o Caddy alcança | bind `./apps/api/data` → fotos e logs |
| `caddy` | `caddy:2-alpine` | `80`, `443` e `443/udp` (HTTP/3) | volumes `caddy_data` (certificados) e `caddy_config` |

- `app` só sobe depois do healthcheck do Postgres (`pg_isready`).
- O compose sobrescreve no `app`: `DATABASE_URL` (aponta para `db`), `NODE_ENV=production`, `API_PORT=8787`, `STORAGE_DIR`, `LOG_DIR` e `TRUST_PROXY=true` (o Caddy informa o IP real do visitante em `X-Forwarded-For`, usado no limite de tentativas de login e na auditoria).
- `Caddyfile`: `{$APP_DOMAIN}` com compressão zstd/gzip e proxy reverso para `app:8787`; `www.{$APP_DOMAIN}` redireciona permanentemente para o domínio principal. Com `APP_DOMAIN=localhost`, o Caddy usa certificado da CA interna dele.

### Variáveis de ambiente (`.env`, nunca no git)

Modelo completo em `.env.example`. As que mudam de um ambiente para o outro:

| Variável | Local | AWS |
|---|---|---|
| `POSTGRES_PASSWORD` | `orchidiary` | senha longa e aleatória (vale só na criação do volume) |
| `DATABASE_URL` | `postgres://…@localhost:5432/orchidiary` | ignorada (o compose aponta para `db`) |
| `APP_DOMAIN` | `localhost` | `orchidiary.com` |
| `WEB_ORIGIN` | `http://localhost:5173` ou o endereço `*.ts.net` | `https://orchidiary.com` (CORS e retorno do OAuth do Google Drive) |
| `NODE_ENV` | `development` | `production` (o compose já força no `app`) |
| `MASTER_EMAIL` / `MASTER_PASSWORD` | à vontade | senha longa e única |
| `SECRETS_KEY` | qualquer chave de teste | chave de produção, guardada no gerenciador de senhas |

`SECRETS_KEY` criptografa no banco os segredos do Telegram e do Google Drive. Ao mover o banco de máquina, leve a **mesma** chave; sem ela as integrações salvas ficam ilegíveis.

## Ambiente local (PC Windows)

Pré-requisitos: Node 22+, pnpm 10, Docker Desktop e Tailscale.

### Modo desenvolvimento (`pnpm dev`)

```
Navegador ──▶ Vite :5173 ──/api──▶ API :8787 (node --watch + tsx) ──▶ Postgres :5432 (Docker, só 127.0.0.1)
```

```bash
pnpm db:up      # só o Postgres: docker-compose.yml + docker-compose.dev.yml
pnpm dev        # API (8787) + Vite (5173) em paralelo
```

- `docker-compose.dev.yml` publica a 5432 apenas em `127.0.0.1`, para a API rodando fora do Docker.
- O Vite escuta em todas as interfaces (`host: true`) e aceita hosts `.ts.net`, para abrir no celular.
- A API lê o `.env` da raiz (`--env-file=../../.env`). Fotos e logs ficam em `apps/api/data/` (ignorado pelo git).
- Migrações: `pnpm db:generate` gera a partir do schema (commitar `apps/api/drizzle/`); `pnpm db:migrate` e `pnpm db:seed` aplicam.

### Celular via Tailscale

Câmera e GPS exigem HTTPS. Com o Tailscale no PC e no celular:

```bash
tailscale serve --bg 5173    # publica o Vite em https://<pc>.<tailnet>.ts.net
```

Coloque esse endereço em `WEB_ORIGIN` e reinicie a API.

### Modo produção local (Docker completo)

```bash
docker compose up -d --build   # db + app + caddy
```

Desde a preparação para a AWS, o `app` não publica mais a 8787 no host: o acesso é pelo Caddy, em `https://localhost` (certificado da CA interna do Caddy). O `pnpm dev` e o container `app` usam o mesmo banco; pare o `app` antes de programar (`docker compose stop app`).

## Ambiente AWS (produção)

### Servidor

| Item | Valor |
|---|---|
| Instância | Amazon Lightsail, plano de 2 GB de RAM e 2 vCPU (por baixo, um `t3.small`), região `sa-east-1` (São Paulo), zona `sa-east-1a` |
| Sistema | Ubuntu 24.04 LTS, x86_64, usuário `ubuntu` |
| Disco | SSD de 60 GB do plano; em uso ~7 GB |
| Swap | nenhuma |
| Software | Docker 29 com Compose v5, Git e Tailscale 1.104 (com Tailscale SSH ligado) |
| Código | clone do repositório em `~/orchidiary`, sempre igual a `origin/main` |
| Configuração | `~/orchidiary/.env`, criado à mão no servidor (não vem do git) |
| Dados | volume `orchidiary_pgdata` (banco), `~/orchidiary/apps/api/data` (fotos e logs), `orchidiary_caddy_data` (certificados) |
| Endereços | IP estático do Lightsail `56.126.56.149` (não muda ao parar e religar a instância); na tailnet, `100.94.212.52` |

### Domínio e DNS

- Domínio `orchidiary.com`, com DNS na UOL (`ns1`, `ns2` e `ns3.dominios.uol.com.br`).
- `orchidiary.com` → registro A para `56.126.56.149`; `www.orchidiary.com` → alias para o domínio principal. O Caddy emite o certificado dos dois e redireciona `www` para `https://orchidiary.com`.

### Rede

| Porta | Liberada para | Para quê |
|---|---|---|
| 80/tcp | internet (IPv4 e IPv6) | desafio do Let's Encrypt e redirecionamento para HTTPS |
| 443/tcp | internet (IPv4) | o app em HTTPS |
| 22/tcp | internet (IPv4 e IPv6) | SSH; mantida aberta de propósito (acesso fora da tailnet e SSH pelo navegador no console do Lightsail). O uso normal é pela tailnet |
| 5432, 8787 | nunca | ficam na rede interna do Docker |

- Firewall: só o firewall da instância no Lightsail; o `ufw` da VM está desligado.
- A 443 não está liberada em IPv6 nem em UDP: o HTTP/3 do Caddy (`443/udp`) não chega aos visitantes. Para ter HTTP/3, acrescente uma regra `UDP 443` no firewall do Lightsail.

### Segurança na borda

- HTTPS automático pelo Caddy, com renovação dos certificados.
- `secureHeaders` na API, com HSTS só em produção; cookie de sessão `Secure` em produção.
- Login bloqueado após 5 falhas por e-mail+IP ou 20 por IP em 15 minutos (429 + `Retry-After`, auditado).
- Postgres sem porta publicada; rotas `/api/settings/*` só para o master.

### Deploy contínuo (`.github/workflows/deploy.yml`)

Dispara a cada push na `main` (ou manualmente, `workflow_dispatch`). Um deploy por vez (`concurrency: deploy`), limite de 20 minutos.

1. O runner entra na tailnet com `tailscale/github-action@v3` (OAuth client, tag `tag:ci`).
2. Faz SSH em `ubuntu@SSH_HOST` (endereço da VM na tailnet) e roda:
   ```bash
   cd ~/orchidiary
   git fetch origin main
   git reset --hard origin/main
   docker compose up -d --build
   docker image prune -f
   ```
3. O novo container `app` aplica as migrações e o seed ao iniciar.

Segredos do repositório no GitHub: `TS_OAUTH_CLIENT_ID`, `TS_OAUTH_SECRET` e `SSH_HOST` (o endereço da VM na tailnet). O runner não usa chave SSH: a VM tem o Tailscale SSH ligado, e a política de SSH da tailnet precisa permitir que `tag:ci` entre como `ubuntu`.

O build da imagem acontece na própria VM. Com 2 GB de RAM e sem swap, um build pesado do web pode ser encerrado por falta de memória; criar um arquivo de swap (1–2 GB) evita isso.

### Operação na VM

```bash
ssh ubuntu@100.94.212.52             # pela tailnet
cd ~/orchidiary
docker compose ps                    # status
docker compose logs -f app           # logs da API (também em apps/api/data/logs)
docker compose logs -f caddy         # certificados e acessos
docker compose exec db psql -U orchidiary -d orchidiary
docker compose up -d --build app     # rebuild manual só do app
```

`docker compose down -v` apaga o volume `pgdata`, ou seja, o banco. Não use sem backup.

## Backup e migração de dados

- **Backup semanal no Google Drive**, feito pelo próprio app (configurado pelo master em Ajustes): JSON comprimido com os dados e fotos incrementais. Não leva senhas, sessões, segredos nem `app_logs`.
- **Snapshots do disco da VM**: **(a confirmar se os snapshots automáticos estão ligados na instância do Lightsail)**. A VM não tem crontab: não existe outro backup agendado no servidor.
- Volume atual (19.X.2026): fotos 5,4 MB, logs 624 KB.
- Para levar os dados do PC para a VM (ou entre servidores), um caminho é `pg_dump` + arquivo das fotos:
  ```bash
  # origem
  docker compose exec -T db pg_dump -U orchidiary -Fc orchidiary > orchidiary.dump
  tar czf photos.tgz -C apps/api/data photos
  # destino (com o db no ar e o app parado)
  docker compose exec -T db pg_restore -U orchidiary -d orchidiary --clean --if-exists < orchidiary.dump
  tar xzf photos.tgz -C apps/api/data
  ```
  Use a mesma `SECRETS_KEY` da origem. Os arquivos de dump contêm dados pessoais: não os commite.
