/** Ambiente onde a planta vive. O clima da API é sempre o externo. */
export const ENVIRONMENTS = ["indoor", "outdoor"] as const;
export type Environment = (typeof ENVIRONMENTS)[number];

export const USER_ROLES = ["master", "user"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const PLANT_STATUSES = ["active", "dormant", "in_treatment", "given_away", "dead"] as const;
export type PlantStatus = (typeof PLANT_STATUSES)[number];

export const PLANT_ORIGINS = ["purchase", "trade", "gift", "division", "keiki", "seed", "rescue", "other"] as const;
export type PlantOrigin = (typeof PLANT_ORIGINS)[number];

/** Tipos de evento do diário. Cada um ganha um ícone na linha do tempo. */
export const EVENT_TYPES = [
  "note",
  "watering",
  "fertilizing",
  "repotting",
  "bloom_start",
  "bloom_end",
  "new_growth",
  "new_root",
  "keiki",
  "pest",
  "disease",
  "treatment",
  "moved",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const PHOTO_SOURCES = ["camera", "upload"] as const;
export type PhotoSource = (typeof PHOTO_SOURCES)[number];

export const INTEGRATIONS = ["telegram", "google_drive", "openai"] as const;
export type Integration = (typeof INTEGRATIONS)[number];

/** Estado da ilustração botânica gerada a partir da foto de capa */
export const ILLUSTRATION_STATUSES = ["pending", "ready", "error"] as const;
export type IllustrationStatus = (typeof ILLUSTRATION_STATUSES)[number];

/**
 * Níveis da classificação, do mais alto ao mais baixo. `nothogenus` é um gênero
 * híbrido (ex.: Rhyncholaeliocattleya); `hybrid` é um grex registrado
 * (ex.: Vanda Sansai Blue); `cultivar` é um clone ('Azul Real').
 */
export const TAXON_RANKS = [
  "family",
  "subfamily",
  "tribe",
  "subtribe",
  "genus",
  "nothogenus",
  "species",
  "subspecies",
  "variety",
  "form",
  "hybrid",
  "cultivar",
] as const;
export type TaxonRank = (typeof TAXON_RANKS)[number];

/**
 * De onde vem o táxon: de países (`country`, com os códigos em `origin_country_codes`, o principal primeiro) ou de
 * cruzamento (`cross`: híbridos feitos por gente, sem lugar de origem). Sem nada preenchido,
 * vale o do ancestral mais próximo; se ninguém sabe, a origem é desconhecida.
 */
export const TAXON_ORIGIN_KINDS = ["country", "cross"] as const;
export type TaxonOriginKind = (typeof TAXON_ORIGIN_KINDS)[number];

/** Lados de uma cruza, na convenção `semente × pólen`: a mãe (que deu o fruto) e o pai. */
export const CROSS_SIDES = ["seed", "pollen"] as const;
export type CrossSide = (typeof CROSS_SIDES)[number];

export const ILLUSTRATION_QUALITIES =["low", "medium", "high"] as const;
export type IllustrationQuality = (typeof ILLUSTRATION_QUALITIES)[number];
