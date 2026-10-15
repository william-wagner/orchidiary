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

## Localização da planta (regra central)

- Cada planta tem um **histórico de locais** (`plant_locations`), com `valid_from` e `valid_to`. O local atual é o que tem `valid_to` nulo (garantido por índice único parcial).
- **Mudar de lugar nunca altera o passado.** Uma mudança fecha o período atual e abre outro a partir da data informada. Coordenadas antigas não são editadas. A planta pode ter ido de Belo Horizonte para São Paulo, e o diário de BH continua com o clima de BH.
- A nova data precisa ser posterior ao início do local atual e não pode estar no futuro (`planMove`, em `packages/shared/src/locations.ts`). Não se insere período no meio do histórico.
- O **ambiente** (`indoor` / `outdoor`) faz parte do período: levar a planta da varanda para dentro de casa também é uma mudança registrada.
- Cada mudança gera um evento `moved` na linha do tempo.

### Foto tirada em outro lugar

1. Ao tirar foto pela câmera, o app envia o GPS do aparelho; no upload da galeria, a API lê o GPS e a data do EXIF.
2. A API compara com o local da ficha **vigente no momento da foto**. Se a distância passar de `LOCATION_MISMATCH_METERS` (padrão 300 m, somada à imprecisão do GPS), a resposta traz `locationCheck.mismatch = true`.
3. O app pergunta se a planta mudou de lugar. Se sim, registra um novo local a partir do horário da foto.
4. Se a foto for anterior ao local atual (`canMoveFromPhoto = false`), o app só informa: uma foto antiga não pode mudar o local de hoje.

## Clima

- Fonte: Open-Meteo (gratuita, sem chave). Últimos ~85 dias pela API de previsão; períodos mais antigos pela API histórica.
- Guardado por **período de local** e por dia (`weather_daily`, único por `location_id + date`). Por isso o clima também nunca muda retroativamente.
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

## Alertas no Telegram

- O master cadastra o token do bot e o chat id. Os segredos ficam criptografados no banco (AES-256-GCM com `SECRETS_KEY`) e nunca voltam para o navegador.
- Cada alerta tem uma `dedupe_key` (ex.: `cold:<planta>:<data>`): o mesmo alerta não é enviado duas vezes.
- Alertas atuais: frio ou calor previsto para amanhã fora da faixa da espécie; falha no backup.

## Backup semanal no Google Drive

- O master cria um cliente OAuth no Google Cloud (tipo Aplicativo da Web), informa Client ID e Client Secret e toca em **Conectar**. O endereço de retorno é `WEB_ORIGIN/api/settings/google-drive/callback`.
- Escopo `drive.file`: o app só enxerga o que ele mesmo criou.
- Estrutura no Drive:
  - `Orchidiary/backups/orchidiary-backup-AAAA-MM-DD.json.gz`: exportação completa dos dados (sem senhas, sessões nem segredos). Mantém os N últimos.
  - `Orchidiary/fotos/<id>.webp`: incremental, cada foto sobe uma vez.
- Dia, hora e retenção são configuráveis. Se o PC estiver desligado no horário, o backup roda assim que possível.

## Fotos

- Redimensionadas para no máximo 2048 px (WebP) e miniatura de 480 px. Os metadados EXIF são removidos do arquivo salvo (a data e o GPS ficam no banco).
- Armazenamento local atrás de uma interface (`services/storage.ts`), pronta para trocar por S3/R2.
