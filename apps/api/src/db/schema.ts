import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  ENVIRONMENTS,
  EVENT_TYPES,
  ILLUSTRATION_STATUSES,
  INTEGRATIONS,
  PHOTO_SOURCES,
  PLANT_ORIGINS,
  PLANT_STATUSES,
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
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("taxa_parent_idx").on(t.parentId),
    unique("taxa_parent_rank_name_uq").on(t.parentId, t.rank, t.name).nullsNotDistinct(),
    // gênero e níveis acima têm nome único no catálogo inteiro
    uniqueIndex("taxa_higher_name_uq")
      .on(t.rank, t.name)
      .where(sql`${t.rank} in ('family', 'subfamily', 'tribe', 'subtribe', 'genus', 'nothogenus')`),
    index("taxa_search_trgm_idx").using("gin", sql`${t.searchText} gin_trgm_ops`),
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
    /** Pode ser qualquer nível: quem só sabe que é uma Vanda aponta para o gênero */
    taxonId: uuid("taxon_id").references(() => taxa.id, { onDelete: "set null" }),
    /** Nome livre quando o táxon não está no catálogo */
    taxonText: text("taxon_text"),
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
    uniqueIndex("plants_user_accession_idx").on(t.userId, t.accessionNumber),
  ],
);

/**
 * Lugares nomeados do usuário ("Orquidário quarto", "Varanda dos fundos").
 * Cadastrados e mantidos direto no campo "Nome do lugar"; os períodos de local
 * das plantas apontam para cá. O nome é único por usuário, sem diferenciar maiúsculas.
 */
export const places = pgTable(
  "places",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("places_user_name_uq").on(t.userId, sql`lower(${t.name})`)],
);

/**
 * Histórico de locais. Linhas existentes nunca têm coordenadas alteradas:
 * mudar de lugar fecha o período atual (valid_to) e cria um novo.
 * O ambiente (indoor/outdoor) faz parte do período, pois também muda com o tempo.
 */
export const plantLocations = pgTable(
  "plant_locations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    plantId: uuid("plant_id")
      .notNull()
      .references(() => plants.id, { onDelete: "cascade" }),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    /** Lugar nomeado deste período. Só dá para apagar um lugar que nenhum período usa. */
    placeId: uuid("place_id").references(() => places.id, { onDelete: "restrict" }),
    environment: environment("environment").notNull(),
    validFrom: ts("valid_from").notNull(),
    validTo: ts("valid_to"),
    createdAt: createdAt(),
  },
  (t) => [
    index("plant_locations_plant_idx").on(t.plantId, t.validFrom),
    // no máximo um local "atual" por planta
    uniqueIndex("plant_locations_one_open_idx").on(t.plantId).where(sql`${t.validTo} is null`),
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
    createdAt: createdAt(),
  },
  (t) => [index("events_plant_idx").on(t.plantId, t.occurredAt)],
);

/** Clima externo diário (Open-Meteo), ligado ao PERÍODO de local — por isso nunca muda retroativamente. */
export const weatherDaily = pgTable(
  "weather_daily",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    locationId: uuid("location_id")
      .notNull()
      .references(() => plantLocations.id, { onDelete: "cascade" }),
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
  (t) => [uniqueIndex("weather_daily_location_date_idx").on(t.locationId, t.date)],
);

/** Termo-higrômetro do usuário — o microclima real (indoor ou outdoor). */
export const manualReadings = pgTable(
  "manual_readings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    plantId: uuid("plant_id")
      .notNull()
      .references(() => plants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    measuredAt: ts("measured_at").notNull(),
    temperature: real("temperature"),
    humidity: real("humidity"),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [index("manual_readings_plant_idx").on(t.plantId, t.measuredAt)],
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
