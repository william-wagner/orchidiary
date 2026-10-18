# Arquitetura e regras de negócio

## Visão geral

```
Celular / PC ──HTTPS (Tailscale)──▶ API Hono (Node) ──▶ Postgres
                                       │  └─ disco: fotos (data/photos)
                                       ├─▶ Open-Meteo (clima diário e previsão)
                                       ├─▶ Telegram Bot API (alertas)
                                       └─▶ Google Drive API (backup semanal)
```

- Monorepo pnpm em TypeScript. `packages/shared` concentra enums, validações Zod e regras puras (geolocalização, datas, clima), testadas sem banco.
- Em desenvolvimento o Vite (5173) faz proxy de `/api` para a API (8787). Em produção a API serve o build do app web: um único endereço para o Tailscale.
- Todas as tabelas de dados do usuário têm `user_id`, para o app poder virar público sem refazer o banco.

## Usuários e permissões

- Papéis: `master` e `user`. O seed cria o master a partir do `.env`.
- Login por e-mail e senha (hash scrypt), sessão em cookie httpOnly (o banco guarda só o sha256 do token).
- **Somente o master** acessa `/api/settings/*` e a tela Ajustes: Telegram, Google Drive e backups. Também só ele edita o Guia de Cultivo por enquanto.

## Guia de Cultivo: árvore taxonômica

- Uma tabela só, `taxa`, em que cada táxon aponta para o pai (`parent_id`): família → subfamília → tribo → subtribo → gênero → espécie → subespécie / variedade / forma. Híbridos registrados (grex) ficam abaixo do gênero ou de um gênero híbrido (`nothogenus`, ex.: *Rhyncholaeliocattleya*); cultivares, abaixo da espécie ou do híbrido.
- Pular níveis é permitido (um gênero pode ficar direto abaixo da família). Quais níveis podem ficar abaixo de quais está em `canBeChildOf` (`packages/shared/src/taxonomy.ts`); a API também impede ciclos.
- `name` guarda só a parte própria ("coerulea"); `full_name` ("Vanda coerulea var. alba") e `search_text` derivam da linhagem e são recalculados quando um táxon muda de nome ou de lugar.
- A planta aponta para **qualquer nível** (`plants.taxon_id`): quem só sabe que é uma Vanda escolhe o gênero. `taxon_text` fica para o nome livre, quando o táxon não está no catálogo.
- **Ficha herdada**: cada campo de cultivo vem do táxon mais específico da linhagem que o preencheu (`inheritCare`). Uma *Vanda coerulea* sem faixa própria usa a do gênero *Vanda*, inclusive nos alertas.
- Busca (`GET /api/taxa?q=`): palavra por palavra em `search_text` (nome completo + nomes populares, sem acento), com índice de trigramas (`pg_trgm`). Sem resultado exato, tenta por semelhança, para erros de grafia.
- Nomes antigos entram como nomes populares (*Laelia purpurata* → *Cattleya purpurata*, *Ascocenda* → *Vanda*). Sinônimos com nome aceito são uma evolução futura.
- O catálogo inicial (`apps/api/src/db/catalog.ts`, classificação de Chase et al. 2015) é aplicado pelo seed sem desfazer edições: cria o que falta, encaixa gêneros soltos na árvore, soma nomes populares e só preenche a ficha de táxons que não têm nenhum campo.
- Origem: `taxa.origin_kind` (`country` ou `cross`) + `origin_country_codes` (países de ocorrência, ISO alfa-2, o principal primeiro; lista em `ORIGIN_COUNTRIES`). Vazio herda do ancestral mais próximo que informou (`resolveOrigin`); sem ninguém, é desconhecida. Híbrido e gênero híbrido são `cross` (`normalizeOrigin`). O front mostra a bandeira do principal com "+N" (os outros países no title), "?" ou o ícone de cruzamento logo depois do nome (`OriginFlag`). Países do catálogo inicial: `apps/api/src/db/catalogOrigins.ts` (principal em `byCountry`, os demais em `alsoIn`).
- Itálico: gênero e abaixo; acima do gênero, grex e cultivar ficam em redondo ("*Vanda* Sansai Blue 'Azul Real'"), via `taxonNameParts`.

## Localização da planta (regra central)

- Cada planta tem um **histórico de locais** (`plant_locations`), com `valid_from` e `valid_to`. O local atual é o que tem `valid_to` nulo (garantido por índice único parcial).
- O **nome do lugar** ("Orquidário quarto") vive na tabela `places` (por usuário, nome único sem diferenciar maiúsculas) e cada período aponta para ela por `plant_locations.place_id`. Os lugares são cadastrados, renomeados e apagados no próprio campo "Nome do lugar" (`PlacePicker`, rotas `/api/places`). Renomear vale para o histórico; só se apaga lugar que nenhum período usa.
- **Mudar de lugar nunca altera o passado.** Uma mudança fecha o período atual e abre outro a partir da data informada. Coordenadas antigas não são editadas. A planta pode ter ido de Belo Horizonte para São Paulo, e o diário de BH continua com o clima de BH.
- A nova data precisa ser posterior ao início do local atual e não pode estar no futuro (`planMove`, em `packages/shared/src/locations.ts`). Não se insere período no meio do histórico.
- O **ambiente** (`indoor` / `outdoor`) faz parte do período: levar a planta da varanda para dentro de casa também é uma mudança registrada.
- Cada mudança gera um evento `moved` na linha do tempo.
- **Cidade/estado/país**: cada período guarda também `city`, `state`, `state_code`, `country` e `country_code`, obtidos por geocodificação reversa (Nominatim/OpenStreetMap, `services/geocode.ts`: 1 requisição/s, cache em memória, nunca bloqueia o salvamento). É só um complemento legível: `lat`/`lng` seguem como fonte da verdade e continuam visíveis. Períodos antigos sem localidade são completados ao abrir a planta (`ensureLocality`), mexendo apenas nessas colunas. Formatação ("Belo Horizonte, MG, Brasil") em `formatLocality`, no `packages/shared`.

### Foto tirada em outro lugar

1. Ao tirar foto pela câmera, o app envia o GPS do aparelho; no upload da galeria, a API lê o GPS e a data do EXIF.
2. A API compara com o local da ficha **vigente no momento da foto**. Se a distância passar de `LOCATION_MISMATCH_METERS` (padrão 300 m, somada à imprecisão do GPS), a resposta traz `locationCheck.mismatch = true`.
3. O app pergunta se a planta mudou de lugar. Se sim, registra um novo local a partir do horário da foto.
4. Se a foto for anterior ao local atual (`canMoveFromPhoto = false`), o app só informa: uma foto antiga não pode mudar o local de hoje.

## Clima

- Fonte: Open-Meteo (gratuita, sem chave). Últimos ~85 dias pela API de previsão; períodos mais antigos pela API histórica.
- Guardado por **período de local** e por dia (`weather_daily`, único por `location_id + date`). Por isso o clima também nunca muda retroativamente.
- A consulta é agrupada por **coordenada** (4 casas decimais, `coordKey`), sem filtro de usuário: períodos no mesmo ponto, de qualquer usuário, dividem a mesma requisição, e cada dia retornado é gravado só nos períodos que precisavam dele (`planWeatherFetches` em `packages/shared`). O mesmo vale para a previsão dos alertas.
- Dias no fuso `APP_TIMEZONE`. O dia da mudança pertence ao local novo.
- Métricas: mínima, máxima e média, umidade (média, mínima e máxima), ponto de orvalho, VPD (calculado a partir de temperatura e umidade horárias), chuva, radiação, horas de sol, evapotranspiração e vento máximo.
- **Backfill**: a coleta calcula os dias que faltam no banco e busca só esses. Se o PC ficar desligado, os dias perdidos são preenchidos quando ele voltar.
- O clima da API é sempre o **externo**. Para plantas `indoor`, o app mostra o clima como referência e oferece medições manuais (`manual_readings`) de temperatura e umidade.

## Rotinas agendadas (fuso `APP_TIMEZONE`)

| Quando | O quê |
|---|---|
| Ao iniciar a API e todo dia às 06:10 | Coleta e backfill do clima |
| Todo dia às 18:00 | Previsão de amanhã x faixas da ficha (só `outdoor`) e alerta de frio/calor no Telegram |
| De hora em hora | Verifica se o backup semanal está na hora ou atrasado |
| Todo dia às 04:40 | Apaga registros vencidos de `app_logs` |

## Alertas no Telegram

- O master cadastra o token do bot e o chat id. Os segredos ficam criptografados no banco (AES-256-GCM com `SECRETS_KEY`) e nunca voltam para o navegador.
- Cada alerta tem uma `dedupe_key` (ex.: `cold:<planta>:<data>`): o mesmo alerta não é enviado duas vezes.
- Alertas atuais: frio ou calor previsto para amanhã fora da faixa da ficha (própria ou herdada do gênero); falha no backup.

## Backup semanal no Google Drive

- O master cria um cliente OAuth no Google Cloud (tipo Aplicativo da Web), informa Client ID e Client Secret e toca em **Conectar**. O endereço de retorno é `WEB_ORIGIN/api/settings/google-drive/callback`.
- Escopo `drive.file`: o app só enxerga o que ele mesmo criou.
- Estrutura no Drive:
  - `Orchidiary/backups/orchidiary-backup-AAAA-MM-DD.json.gz`: exportação completa dos dados (sem senhas, sessões nem segredos). Mantém os N últimos.
  - `Orchidiary/fotos/<id>.webp`: incremental, cada foto sobe uma vez.
- Dia, hora e retenção são configuráveis. Se o PC estiver desligado no horário, o backup roda assim que possível.

## Logs

Logger único (`apps/api/src/logger.ts`, pino) com três destinos:

| Destino | O que recebe | Retenção |
|---|---|---|
| stdout | Tudo a partir de `LOG_LEVEL` (legível em dev, JSON em produção) | — |
| Arquivo `LOG_DIR/api.AAAA-MM-DD.N.log` | O mesmo, em JSON, um arquivo por dia | `LOG_FILE_RETENTION_DAYS` (14) |
| Tabela `app_logs` | Só `warn`/`error`/`fatal` e eventos de **auditoria** (`level = audit`) | `LOG_DB_RETENTION_DAYS` (90); auditoria 365 dias |

- Cada requisição ganha um `requestId` (header `X-Request-Id`), presente na linha de acesso, nos erros e nas auditorias. O corpo e a query string nunca são logados.
- `password`, `token`, `botToken`, `clientSecret`, `refreshToken`, `secrets`, cookies e `Authorization` são redigidos pelo pino antes de chegar ao arquivo ou ao banco.
- Auditoria (`logging/audit.ts`): login e logout, falha de login, alterações de Telegram e Google Drive, backup manual. Registra o IP da conexão direta.
- A gravação no banco é em lote e nunca derruba a API: se o Postgres estiver fora, o buffer é limitado e o arquivo continua gravando. Ao encerrar (SIGINT/SIGTERM ou erro fatal) o buffer é gravado antes de sair.
- A limpeza de `app_logs` roda todo dia às 04:40. Os arquivos são removidos pela própria rotação.
- `GET /api/settings/logs` (**somente master**) lista `app_logs` com filtros `level`, `source` (prefixo), `q` (texto), `from`, `to` e paginação por `cursor`.
- `app_logs` não entra no backup do Drive.

## Fotos

- Redimensionadas para no máximo 2048 px (WebP) e miniatura de 480 px. Os metadados EXIF são removidos do arquivo salvo (a data e o GPS ficam no banco).
- Armazenamento local atrás de uma interface (`services/storage.ts`), pronta para trocar por S3/R2.
