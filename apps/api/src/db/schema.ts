import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  COMFORT_DIMENSIONS,
  CROSS_SIDES,
  ENVIRONMENTS,
  type ExternalOutcome,
  type ExternalService,
  EVENT_TYPES,
  ILLUSTRATION_STATUSES,
  INTEGRATIONS,
  PHOTO_SOURCES,
  PLANT_ORIGINS,
  PLANT_STATUSES,
  TAXON_ORIGIN_KINDS,
  TAXON_RANKS,
  USER_ROLES,
} from "@orchidiary/shared";

const ts = (name: string) => timestamp(name, { withTimezone: true });
const createdAt = () => ts("created_at").notNull().defaultNow();

export const userRole = pgEnum("user_role", USER_ROLES);
export const environment = pgEnum("environment", ENVIRONMENTS);
export const plantStatus = pgEnum("plant_status", PLANT_STATUSES);
export const plantOrigin = pgEnum("plant_origin", PLANT_ORIGINS);
export const eventType = pgEnum("event_type", EVENT_TYPES);
export const photoSource = pgEnum("photo_source", PHOTO_SOURCES);
export const integration = pgEnum("integration", INTEGRATIONS);
export const illustrationStatus = pgEnum("illustration_status", ILLUSTRATION_STATUSES);

// ─── Usuários ────────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: userRole("role").notNull().default("user"),
  passwordHash: text("password_hash").notNull(),
  telegramChatId: text("telegram_chat_id"),
  createdAt: createdAt(),
});

export const sessions = pgTable(
  "sessions",
  {
    /** sha256 do token do cookie; o token em si nunca é gravado */
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: ts("expires_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

// ─── Guia de Cultivo: árvore taxonômica ──────────────────────────────────────

export const taxonRank = pgEnum("taxon_rank", TAXON_RANKS);
export const taxonOriginKind = pgEnum("taxon_origin_kind", TAXON_ORIGIN_KINDS);
export const comfortDimension = pgEnum("comfort_dimension", COMFORT_DIMENSIONS);
export const crossSide = pgEnum("cross_side", CROSS_SIDES);

/**
 * Catálogo de táxons em árvore (família → … → gênero → espécie → variedade;
 * híbridos e cultivares abaixo do gênero). Cada táxon tem um único pai; a ficha
 * de cultivo é opcional e herdada do ancestral mais próximo que a preencheu.
 * `full_name` e `search_text` derivam da linhagem e são recalculados quando
 * um nome ou pai muda (ver services/taxonomy.ts).
 */
export const taxa = pgTable(
  "taxa",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    parentId: uuid("parent_id").references((): AnyPgColumn => taxa.id, { onDelete: "restrict" }),
    rank: taxonRank("rank").notNull(),
    /** Só a parte própria do nome: "Vanda", "coerulea", "alba", "Sansai Blue" */
    name: text("name").notNull(),
    /** Nome completo, ex.: "Vanda coerulea var. alba" */
    fullName: text("full_name").notNull(),
    /** Nome completo e populares, normalizados (sem acento, minúsculos) para a busca */
    searchText: text("search_text").notNull(),
    commonNames: text("common_names").array().notNull().default(sql`'{}'::text[]`),
    /**
     * De onde vem: países de ocorrência (`country` + `origin_country_codes`, ISO alfa-2, o principal
     * primeiro) ou cruzamento (`cross`). Nulo herda do ancestral mais próximo que informou; sem
     * ninguém, a origem é desconhecida.
     */
    originKind: taxonOriginKind("origin_kind"),
    originCountryCodes: text("origin_country_codes").array().notNull().default(sql`'{}'::text[]`),
    tempDayMin: real("temp_day_min"),
    tempDayMax: real("temp_day_max"),
    tempNightMin: real("temp_night_min"),
    tempNightMax: real("temp_night_max"),
    humidityMin: real("humidity_min"),
    humidityMax: real("humidity_max"),
    light: text("light"),
    watering: text("watering"),
    fertilizing: text("fertilizing"),
    substrate: text("substrate"),
    /** Meses de floração mais comuns (1–12) */
    bloomMonths: integer("bloom_months").array().notNull().default(sql`'{}'::integer[]`),
    restPeriod: text("rest_period"),
    notes: text("notes"),
    /** Parentais do grex (semente × pólen); só em `hybrid` */
    crossId: uuid("cross_id").references((): AnyPgColumn => crosses.id),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("taxa_parent_idx").on(t.parentId),
    check("taxa_cross_rank_ck", sql`${t.crossId} is null or ${t.rank} = 'hybrid'`),
    unique("taxa_parent_rank_name_uq").on(t.parentId, t.rank, t.name).nullsNotDistinct(),
    // gênero e níveis acima têm nome único no catálogo inteiro
    uniqueIndex("taxa_higher_name_uq")
      .on(t.rank, t.name)
      .where(sql`${t.rank} in ('family', 'subfamily', 'tribe', 'subtribe', 'genus', 'nothogenus')`),
    index("taxa_search_trgm_idx").using("gin", sql`${t.searchText} gin_trgm_ops`),
    // países só existem junto de origin_kind = 'country', e country sempre tem pelo menos um
    check("taxa_origin_countries_ck", sql`coalesce(${t.originKind} = 'country', false) = (cardinality(${t.originCountryCodes}) > 0)`),
  ],
);

/**
 * Cruzamento (semente × pólen): um acontecimento, apontado por quem o usa. A planta aponta por
 * `plants.cross_id` (cruza sem nome registrado) e o grex por `taxa.cross_id` (parentais no catálogo);
 * várias plantas podem dividir a mesma cruza (irmãs). Cada lado é um táxon de qualquer nível, um
 * nome livre ou nada (desconhecido). `user_id` nulo é cruza do catálogo.
 */
export const crosses = pgTable(
  "crosses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    seedTaxonId: uuid("seed_taxon_id").references(() => taxa.id, { onDelete: "restrict" }),
    seedText: text("seed_text"),
    pollenTaxonId: uuid("pollen_taxon_id").references(() => taxa.id, { onDelete: "restrict" }),
    pollenText: text("pollen_text"),
    /** De qual parental vem a ficha de cultivo (ver `careSource`, no shared) */
    careFrom: crossSide("care_from"),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("crosses_user_idx").on(t.userId),
    check("crosses_seed_ck", sql`${t.seedTaxonId} is null or ${t.seedText} is null`),
    check("crosses_pollen_ck", sql`${t.pollenTaxonId} is null or ${t.pollenText} is null`),
    check(
      "crosses_care_ck",
      sql`${t.careFrom} is null
        or (${t.careFrom} = 'seed' and ${t.seedTaxonId} is not null)
        or (${t.careFrom} = 'pollen' and ${t.pollenTaxonId} is not null)`,
    ),
  ],
);

// ─── Diário ──────────────────────────────────────────────────────────────────

export const plants = pgTable(
  "plants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Pode ser qualquer nível: quem só sabe que é uma Vanda aponta para o gênero. Nunca junto com `cross_id` */
    taxonId: uuid("taxon_id").references(() => taxa.id, { onDelete: "restrict" }),
    /** Cruza sem nome registrado (semente × pólen); nunca junto com `taxon_id` */
    crossId: uuid("cross_id").references(() => crosses.id),
    /** O nome como veio na etiqueta ou do vendedor, do jeito que veio; não muda a ficha */
    receivedName: text("received_name"),
    nickname: text("nickname").notNull(),
    /** Número de tombo: sequencial por usuário, nunca reaproveitado (identidade "Herbário") */
    accessionNumber: integer("accession_number"),
    status: plantStatus("status").notNull().default("active"),
    origin: plantOrigin("origin"),
    acquiredAt: ts("acquired_at"),
    /** Planta-mãe (keiki, divisão) — genealogia da coleção */
    parentPlantId: uuid("parent_plant_id").references((): AnyPgColumn => plants.id, { onDelete: "set null" }),
    potNotes: text("pot_notes"),
    substrate: text("substrate"),
    notes: text("notes"),
    coverPhotoId: uuid("cover_photo_id"),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("plants_user_idx").on(t.userId),
    index("plants_taxon_idx").on(t.taxonId),
    index("plants_cross_idx").on(t.crossId),
    uniqueIndex("plants_user_accession_idx").on(t.userId, t.accessionNumber),
    // a planta é determinada por um táxon ou por uma cruza, nunca pelos dois
    check("plants_determination_ck", sql`num_nonnulls(${t.taxonId}, ${t.crossId}) <= 1`),
  ],
);

/**
 * Lugares nomeados do usuário ("Orquidário quarto", "Varanda dos fundos").
 * O lugar é dono da localização e do ambiente: toda planta registrada nele usa os dois,
 * e o clima é coletado por lugar, mesmo quando não há nenhuma planta ali.
 * O nome é único por usuário, sem diferenciar maiúsculas.
 */
export const places = pgTable(
  "places",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Dentro de casa ou ao ar livre: atributo do lugar, não da planta. */
    environment: environment("environment").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("places_user_name_uq").on(t.userId, sql`lower(${t.name})`)],
);

/**
 * Histórico de localização do LUGAR. Mesma regra do histórico da planta: corrigir
 * ou mudar a coordenada fecha o período atual e abre outro, nunca reescreve o passado,
 * porque o clima coletado fica pendurado no período.
 */
export const placeLocations = pgTable(
  "place_locations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    placeId: uuid("place_id")
      .notNull()
      .references(() => places.id, { onDelete: "cascade" }),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    /** Cidade/estado/país das coordenadas (geocodificação reversa) */
    city: text("city"),
    state: text("state"),
    stateCode: text("state_code"),
    country: text("country"),
    countryCode: text("country_code"),
    validFrom: ts("valid_from").notNull(),
    validTo: ts("valid_to"),
    createdAt: createdAt(),
  },
  (t) => [
    index("place_locations_place_idx").on(t.placeId, t.validFrom),
    // no máximo uma localização "atual" por lugar
    uniqueIndex("place_locations_one_open_idx").on(t.placeId).where(sql`${t.validTo} is null`),
  ],
);

/**
 * Histórico de permanência da planta: ou ela está num lugar (`place_id`, e então a
 * localização e o ambiente são os do lugar), ou tem localização própria (`lat`/`lng`/
 * `environment`). Nunca os dois — o check garante que não há duas verdades.
 * Mudar de lugar fecha o período atual (valid_to) e cria um novo; o passado fica.
 */
export const plantLocations = pgTable(
  "plant_locations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    plantId: uuid("plant_id")
      .notNull()
      .references(() => plants.id, { onDelete: "cascade" }),
    /** Só quando a planta NÃO está num lugar; com lugar, a coordenada é a dele. */
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    /** Lugar deste período. Só dá para apagar um lugar que nenhum período usa. */
    placeId: uuid("place_id").references(() => places.id, { onDelete: "restrict" }),
    /** Cidade/estado/país das coordenadas próprias (geocodificação reversa) */
    city: text("city"),
    state: text("state"),
    stateCode: text("state_code"),
    country: text("country"),
    countryCode: text("country_code"),
    /** Só quando a planta NÃO está num lugar; com lugar, o ambiente é o dele. */
    environment: environment("environment"),
    validFrom: ts("valid_from").notNull(),
    validTo: ts("valid_to"),
    createdAt: createdAt(),
  },
  (t) => [
    index("plant_locations_plant_idx").on(t.plantId, t.validFrom),
    // no máximo um local "atual" por planta
    uniqueIndex("plant_locations_one_open_idx").on(t.plantId).where(sql`${t.validTo} is null`),
    // ou o lugar manda, ou a planta tem localização própria — nunca os dois
    check(
      "plant_locations_source_ck",
      sql`(${t.placeId} is not null and ${t.lat} is null and ${t.lng} is null and ${t.environment} is null)
        or (${t.placeId} is null and ${t.lat} is not null and ${t.lng} is not null and ${t.environment} is not null)`,
    ),
  ],
);

export const photos = pgTable(
  "photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    plantId: uuid("plant_id")
      .notNull()
      .references(() => plants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull(),
    thumbKey: text("thumb_key"),
    mimeType: text("mime_type").notNull(),
    width: integer("width"),
    height: integer("height"),
    sizeBytes: integer("size_bytes"),
    takenAt: ts("taken_at").notNull(),
    source: photoSource("source").notNull(),
    /** Onde a foto foi tirada (GPS do aparelho ou EXIF) — independente do local da ficha */
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    accuracy: real("accuracy"),
    /** Local da ficha vigente quando a foto foi tirada */
    locationId: uuid("location_id").references(() => plantLocations.id, { onDelete: "set null" }),
    distanceFromPlantM: integer("distance_from_plant_m"),
    caption: text("caption"),
    /** Preenchido quando a foto já foi copiada para o Google Drive (backup incremental) */
    driveFileId: text("drive_file_id"),
    /** Releitura da foto como prancha botânica (só fotos que foram capa). Pode ser refeita, por isso fica fora do backup. */
    illustrationKey: text("illustration_key"),
    illustrationThumbKey: text("illustration_thumb_key"),
    illustrationStatus: illustrationStatus("illustration_status"),
    illustrationUpdatedAt: ts("illustration_updated_at"),
    createdAt: createdAt(),
  },
  (t) => [index("photos_plant_idx").on(t.plantId, t.takenAt)],
);

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    plantId: uuid("plant_id")
      .notNull()
      .references(() => plants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: eventType("type").notNull(),
    occurredAt: ts("occurred_at").notNull(),
    notes: text("notes"),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    photoId: uuid("photo_id").references(() => photos.id, { onDelete: "set null" }),
    /** Registro em lote por local: os eventos do mesmo lote compartilham o id (desfazer, "com outras N") */
    batchId: uuid("batch_id"),
    createdAt: createdAt(),
  },
  (t) => [index("events_plant_idx").on(t.plantId, t.occurredAt), index("events_batch_idx").on(t.batchId)],
);

/**
 * Plantas que ficaram de fora, por escolha, do último lote de cada local e ação.
 * Voltam desmarcadas no próximo lote; cada lote novo substitui a lista.
 */
export const placeBatchExclusions = pgTable(
  "place_batch_exclusions",
  {
    placeId: uuid("place_id")
      .notNull()
      .references(() => places.id, { onDelete: "cascade" }),
    type: eventType("type").notNull(),
    plantId: uuid("plant_id")
      .notNull()
      .references(() => plants.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.placeId, t.type, t.plantId] })],
);

/**
 * Clima externo diário (Open-Meteo), ligado ao PERÍODO da fonte — por isso nunca muda
 * retroativamente. A fonte é o período do LUGAR (uma série para todas as plantas dele,
 * coletada mesmo sem planta nenhuma) ou o período da planta sem lugar. Exatamente uma das duas.
 */
export const weatherDaily = pgTable(
  "weather_daily",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    placeLocationId: uuid("place_location_id").references(() => placeLocations.id, { onDelete: "cascade" }),
    locationId: uuid("location_id").references(() => plantLocations.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    tempMin: real("temp_min"),
    tempMax: real("temp_max"),
    tempMean: real("temp_mean"),
    humidityMean: real("humidity_mean"),
    humidityMin: real("humidity_min"),
    humidityMax: real("humidity_max"),
    dewPointMean: real("dew_point_mean"),
    vpdMean: real("vpd_mean"),
    vpdMax: real("vpd_max"),
    precipitation: real("precipitation"),
    /** MJ/m² */
    radiation: real("radiation"),
    sunshineHours: real("sunshine_hours"),
    et0: real("et0"),
    windMax: real("wind_max"),
    source: text("source").notNull().default("open-meteo"),
    fetchedAt: ts("fetched_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("weather_daily_location_date_idx").on(t.locationId, t.date),
    uniqueIndex("weather_daily_place_location_date_idx").on(t.placeLocationId, t.date),
    check("weather_daily_source_ck", sql`num_nonnulls(${t.placeLocationId}, ${t.locationId}) = 1`),
  ],
);

/**
 * Termo-higrômetro do usuário — o microclima real (indoor ou outdoor).
 * Ou é de uma planta, ou é de um lugar (medição em lote). A do lugar vale para as
 * plantas cujo período ali cobre a data da medição: nada é copiado nem retroativo.
 */
export const manualReadings = pgTable(
  "manual_readings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    plantId: uuid("plant_id").references(() => plants.id, { onDelete: "cascade" }),
    placeId: uuid("place_id").references(() => places.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    measuredAt: ts("measured_at").notNull(),
    temperature: real("temperature"),
    humidity: real("humidity"),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [
    index("manual_readings_plant_idx").on(t.plantId, t.measuredAt),
    index("manual_readings_place_idx").on(t.placeId, t.measuredAt),
    check("manual_readings_owner_ck", sql`num_nonnulls(${t.plantId}, ${t.placeId}) = 1`),
  ],
);

// ─── Integrações e operação (somente master) ─────────────────────────────────

export const integrationSettings = pgTable("integration_settings", {
  key: integration("key").primaryKey(),
  enabled: boolean("enabled").notNull().default(false),
  /** Configuração não sensível (chat id, pasta, agenda) */
  config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
  /** Segredos criptografados com SECRETS_KEY (AES-256-GCM) */
  secretsEnc: text("secrets_enc"),
  updatedAt: ts("updated_at").notNull().defaultNow(),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
});

export const backupRuns = pgTable("backup_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  trigger: text("trigger").notNull(), // "schedule" | "manual"
  status: text("status").notNull(), // "running" | "success" | "error"
  startedAt: ts("started_at").notNull().defaultNow(),
  finishedAt: ts("finished_at"),
  driveFileId: text("drive_file_id"),
  sizeBytes: integer("size_bytes"),
  error: text("error"),
});

/**
 * Logs consultáveis pelo master: só warn/error/fatal e eventos de auditoria.
 * O detalhe completo (inclusive cada requisição) fica no arquivo de log.
 */
export const appLogs = pgTable(
  "app_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    createdAt: createdAt(),
    level: text("level").notNull(), // "warn" | "error" | "fatal" | "audit"
    source: text("source").notNull(), // "http" | "scheduler:clima" | "audit" ...
    message: text("message").notNull(),
    requestId: text("request_id"),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    /** Detalhes já sem segredos (o pino redige antes de gravar) */
    context: jsonb("context").$type<Record<string, unknown>>().notNull().default({}),
    errorStack: text("error_stack"),
  },
  (t) => [
    index("app_logs_created_idx").on(t.createdAt.desc()),
    index("app_logs_level_idx").on(t.level, t.createdAt.desc()),
    index("app_logs_source_idx").on(t.source, t.createdAt.desc()),
  ],
);

/**
 * Cada tentativa de chamada a um serviço externo (Open-Meteo, Nominatim, OpenAI, Telegram, Google).
 * Tudo já chega redigido (ver redactUrl em @orchidiary/shared): sem segredos, sem corpo de requisição,
 * coordenadas arredondadas. Não entra no backup do Drive; a retenção está em logging/retention.ts.
 */
export const externalCalls = pgTable(
  "external_calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    startedAt: ts("started_at").notNull(),
    service: text("service").$type<ExternalService>().notNull(),
    /** Nome lógico: "forecast.daily", "reverse", "images.edits", "files.upload"... */
    operation: text("operation").notNull(),
    method: text("method").notNull(),
    host: text("host").notNull(),
    path: text("path").notNull(),
    query: text("query"),
    outcome: text("outcome").$type<ExternalOutcome>().notNull(),
    /** Null quando não houve resposta (timeout, rede) */
    status: integer("status"),
    /** Início → fim do tratamento da resposta */
    durationMs: integer("duration_ms").notNull(),
    /** Início → headers da resposta */
    ttfbMs: integer("ttfb_ms"),
    requestBytes: integer("request_bytes"),
    responseBytes: integer("response_bytes"),
    /** 1 para a primeira tentativa (reservado para retentativas futuras) */
    attempt: integer("attempt").notNull().default(1),
    errorCode: text("error_code"),
    errorExcerpt: text("error_excerpt"),
    /** Mesmo id do header X-Request-Id; nas rotinas, o id da rodada */
    requestId: text("request_id"),
    /** "http", "scheduler:clima"... */
    origin: text("origin"),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    /** Detalhes da operação (modelo e uso no OpenAI, intervalo no clima...). Já sem segredos. */
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [
    index("external_calls_started_idx").on(t.startedAt.desc()),
    index("external_calls_service_idx").on(t.service, t.startedAt.desc()),
    index("external_calls_request_idx").on(t.requestId),
    // consultas de falhas: o índice parcial fica pequeno
    index("external_calls_failed_idx")
      .on(t.startedAt.desc())
      .where(sql`${t.outcome} <> 'ok'`),
  ],
);

/**
 * "Já sei, não avisar": a dimensão do índice de conforto que o usuário silenciou para a planta.
 * Vale só enquanto a planta estiver no período de local em que foi silenciada; mudou de local, volta a avisar.
 */
export const comfortSilences = pgTable(
  "comfort_silences",
  {
    plantId: uuid("plant_id")
      .notNull()
      .references(() => plants.id, { onDelete: "cascade" }),
    dimension: comfortDimension("dimension").notNull(),
    locationId: uuid("location_id")
      .notNull()
      .references(() => plantLocations.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.plantId, t.dimension] })],
);

/** Registro de alertas enviados; dedupe_key evita repetir o mesmo alerta. */
export const alerts = pgTable("alerts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  plantId: uuid("plant_id").references(() => plants.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  message: text("message").notNull(),
  channel: text("channel").notNull(), // "telegram"
  dedupeKey: text("dedupe_key").notNull().unique(),
  sentAt: ts("sent_at"),
  error: text("error"),
  createdAt: createdAt(),
});
