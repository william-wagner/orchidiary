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
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  ENVIRONMENTS,
  EVENT_TYPES,
  INTEGRATIONS,
  PHOTO_SOURCES,
  PLANT_ORIGINS,
  PLANT_STATUSES,
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

// ─── Guia de Cultivo ─────────────────────────────────────────────────────────

export const species = pgTable(
  "species",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    genus: text("genus").notNull(),
    epithet: text("epithet"),
    /** Nome exibido, ex.: "Cattleya walkeriana" ou "Phalaenopsis (híbridos)" */
    displayName: text("display_name").notNull(),
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
  (t) => [uniqueIndex("species_display_name_idx").on(t.displayName)],
);

// ─── Diário ──────────────────────────────────────────────────────────────────

export const plants = pgTable(
  "plants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    speciesId: uuid("species_id").references(() => species.id, { onDelete: "set null" }),
    taxonText: text("taxon_text"),
    nickname: text("nickname").notNull(),
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
  (t) => [index("plants_user_idx").on(t.userId)],
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
    label: text("label"),
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
