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

## Lugares, localização e ambiente (regra central)

- O **lugar** (`places`) é dono da localização e do ambiente. Uma planta registrada num lugar usa os dois; só quem não está em lugar nenhum guarda localização e ambiente próprios. O check `plant_locations_source_ck` garante que nunca há duas verdades: ou `place_id`, ou `lat`/`lng`/`environment`.
- O lugar tem **histórico de localização** (`place_locations`, com `valid_from`/`valid_to`, um aberto por vez): mudar ou corrigir a coordenada fecha o período atual e abre outro, porque o clima coletado fica pendurado no período.
- Cada planta tem um **histórico de permanência** (`plant_locations`), também com `valid_from`/`valid_to` e um aberto por vez. O nome do lugar vive em `places` (por usuário, nome único sem diferenciar maiúsculas); renomear vale para o histórico, e só se apaga lugar que nenhum período usa.
- **Mudar de lugar nunca altera o passado.** Uma mudança fecha o período atual e abre outro a partir da data informada. A planta pode ter ido de Belo Horizonte para São Paulo, e o diário de BH continua com o clima de BH.
- A nova data precisa ser posterior ao início do período atual e não pode estar no futuro (`planMove`, em `packages/shared/src/locations.ts`). Vale para a planta e para o lugar. Não se insere período no meio do histórico.
- O **ambiente** (`indoor` / `outdoor`) é do lugar. Levar a planta da varanda para dentro de casa é mudar de lugar. Para planta sem lugar, o ambiente é dela e muda com um novo período.
- Cada mudança de lugar gera um evento `moved` na linha do tempo, com os nomes por extenso.
- A API devolve os períodos da planta já **resolvidos** (`resolvePeriod`, em `services/locations.ts`): `lat`, `lng`, `environment` e `placeName` vêm do lugar quando há um. O app não decide nada disso.
- **Cidade/estado/país**: obtidos por geocodificação reversa (Nominatim/OpenStreetMap, `services/geocode.ts`: 1 requisição/s, cache em memória, nunca bloqueia o salvamento) e guardados ao lado das coordenadas — no período do lugar ou no da planta sem lugar. É só um complemento legível: `lat`/`lng` seguem como fonte da verdade. Formatação ("Belo Horizonte, MG, Brasil") em `formatLocality`, no `packages/shared`.

### Foto tirada em outro lugar

1. Ao tirar foto pela câmera, o app envia o GPS do aparelho; no upload da galeria, a API lê o GPS e a data do EXIF.
2. A API compara com o local **vigente no momento da foto** (resolvido: a coordenada do lugar, quando a planta está num). Se a distância passar de `LOCATION_MISMATCH_METERS` (padrão 300 m, somada à imprecisão do GPS), a resposta traz `locationCheck.mismatch = true`.
3. O app pergunta se a planta mudou de lugar. Se sim, registra um novo local a partir do horário da foto.
4. Se a foto for anterior ao local atual (`canMoveFromPhoto = false`), o app só informa: uma foto antiga não pode mudar o local de hoje.

## Clima

- Fonte: Open-Meteo (gratuita, sem chave). Últimos 60 dias pela API de previsão (ela só guarda uns 66 dias de passado); períodos mais antigos pela API histórica.
- O clima é guardado por **período da fonte** e por dia (`weather_daily`), e a fonte é o período de localização do **lugar** (`place_location_id`) ou o período da **planta sem lugar** (`location_id`) — exatamente uma das duas (`weather_daily_source_ck`). Por isso o clima também nunca muda retroativamente.
- **Uma série por lugar**, não por planta: dez plantas no mesmo lugar dividem a mesma série. E **todo lugar coleta, mesmo sem planta nenhuma** — quando a primeira chegar, o histórico dela já começa preenchido, e o lugar tem gráfico próprio na tela de Lugares.
- A série de uma planta é montada por **trechos** (`climateSegments` + `climateWindows`, em `packages/shared`): enquanto esteve num lugar, os dias vêm da série dele; fora, da série dela. Se o lugar mudou de coordenada no meio, o trecho se parte em dois — nada é copiado nem reescrito.
- A consulta é agrupada por **coordenada** (4 casas decimais, `coordKey`), sem filtro de usuário: fontes no mesmo ponto, de qualquer usuário, dividem a mesma requisição, e cada dia retornado é gravado só em quem precisava dele (`planWeatherFetches`). O mesmo vale para a previsão dos alertas.
- Dias no fuso `APP_TIMEZONE`. O dia da mudança pertence ao local novo.
- Métricas: mínima, máxima e média, umidade (média, mínima e máxima), ponto de orvalho, VPD (calculado a partir de temperatura e umidade horárias), chuva, radiação, horas de sol, evapotranspiração e vento máximo.
- **Backfill**: a coleta calcula os dias que faltam no banco e busca só esses. Se o servidor ficar fora do ar, os dias perdidos são preenchidos quando ele voltar.
- O clima da API é sempre o **externo**. Para lugares `indoor`, o app mostra o clima como referência e oferece medições manuais (`manual_readings`) de temperatura e umidade, da planta ou do lugar.

## Clima e ocorrências (ficha da planta)

Especificação completa e protótipo em `docs/estudos/clima-e-ocorrencias.md`.

- **Índice de conforto**: o clima diário contra as faixas da ficha (própria ou herdada), por dimensão: noites (`temp_min`), dias (`temp_max`) e umidade (`humidity_mean`). Cada dia fica dentro, perto (margem de `COMFORT_MARGIN`) ou fora. Regras em `packages/shared/src/comfort.ts`; o card da Coleção usa os últimos 7 dias, e o resumo do Telegram, a quinzena.
- **Gráfico** (`ClimatePanel.tsx`): os três painéis num eixo só, com a faixa ao fundo, as medições manuais (19h às 8h vão para as noites) e a chuva opcional. Janela de 30, 90, 180, 360 dias ou "tudo" (desde o primeiro dia da planta); acima de 120 dias a linha agrega por semana, mas as contas seguem contando dias. Cada dia vem do local onde a planta estava nele: uma mudança no meio da janela vira uma linha vertical, sem recalcular nada.
- **Fita de ocorrências**: fotos e eventos, com camada por tipo (`EVENT_LAYER`). Eventos de lote (`batch_id`) nunca entram; o livro de registro continua mostrando. Pontos agrupados por dia e depois a 17 px no eixo (`clusterOccurrences`). Tocar num ponto abre a folha em tela cheia (`OccurrenceSheet.tsx`) com o clima do dia e o feed, fotos primeiro.
- Janela, camadas e aberto/fechado ficam no `localStorage` do aparelho (`orchidiary:grafico-janela`, `orchidiary:grafico-camadas`, `orchidiary:clima-aberto`).
- API: `GET /api/plants/:id/comfort?days=30|90|180|360|all` (padrão 90) traz as dimensões dia a dia, a chuva e as medições do período; `GET /api/plants/:id/occurrences?from&to` (dias locais, `AAAA-MM-DD`) traz fotos, eventos sem lote e medições em ordem crescente, cada um com o lugar **vigente na data**. As regras puras (janela, semana, camadas, agrupamento, montagem) estão em `packages/shared/src/chart.ts`.
- O "Já sei, não avisar" saiu da interface em 21.X.2026 (volta na Fase 3). A tabela `comfort_silences` e as rotas `PUT/DELETE /plants/:id/comfort/silences/:dimension` continuam, e o resumo quinzenal ainda respeita os silêncios que existirem.
- Dados de desenvolvimento: `pnpm db:seed:demo` recria a planta FAKE com um ano de fotos, eventos, medições, duas mudanças de lugar e clima real (`apps/api/src/db/seedDemo.ts`; as fotos ficam em `.local/`, fora do git).

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
