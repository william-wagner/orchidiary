import { z } from "zod";
import { ENVIRONMENTS, EVENT_TYPES, PHOTO_SOURCES, PLANT_ORIGINS, PLANT_STATUSES } from "./enums.ts";

export const latLngSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

/** Novo local da planta (também usado no cadastro). */
export const locationInputSchema = latLngSchema.extend({
  label: z.string().trim().max(120).optional(),
  environment: z.enum(ENVIRONMENTS),
  /** Quando a planta passou a estar neste local. Default: agora. */
  validFrom: z.coerce.date().optional(),
});

export const plantCreateSchema = z.object({
  nickname: z.string().trim().min(1).max(80),
  speciesId: z.string().uuid().nullish(),
  /** Nome livre quando não há ficha (ex.: híbrido sem registro) */
  taxonText: z.string().trim().max(160).nullish(),
  origin: z.enum(PLANT_ORIGINS).nullish(),
  acquiredAt: z.coerce.date().nullish(),
  parentPlantId: z.string().uuid().nullish(),
  potNotes: z.string().max(500).nullish(),
  substrate: z.string().max(200).nullish(),
  notes: z.string().max(4000).nullish(),
  location: locationInputSchema,
});

export const plantUpdateSchema = plantCreateSchema
  .omit({ location: true })
  .partial()
  .extend({ status: z.enum(PLANT_STATUSES).optional() });

/** Leitura manual de termo-higrômetro (opcional, complementa o clima externo). */
export const manualReadingSchema = z
  .object({
    measuredAt: z.coerce.date().optional(),
    temperature: z.number().min(-20).max(60).nullish(),
    humidity: z.number().min(0).max(100).nullish(),
    notes: z.string().max(500).nullish(),
  })
  .refine((r) => r.temperature != null || r.humidity != null, {
    message: "Informe temperatura, umidade ou ambas.",
  });

export const eventCreateSchema = z.object({
  type: z.enum(EVENT_TYPES),
  occurredAt: z.coerce.date().optional(),
  notes: z.string().max(4000).nullish(),
  /** Campos específicos do tipo (ex.: nº de flores na floração, produto no tratamento) */
  data: z.record(z.string(), z.unknown()).optional(),
});

/** Metadados enviados junto com a foto (multipart). */
export const photoMetaSchema = z.object({
  source: z.enum(PHOTO_SOURCES),
  takenAt: z.coerce.date().optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  accuracy: z.coerce.number().min(0).optional(),
  caption: z.string().max(1000).optional(),
});

export const telegramSettingsSchema = z.object({
  enabled: z.boolean(),
  botToken: z.string().min(20).optional(),
  chatId: z.string().min(1),
});

export const googleDriveSettingsSchema = z.object({
  enabled: z.boolean(),
  clientId: z.string().min(10),
  clientSecret: z.string().min(10).optional(),
  folderId: z.string().optional(),
  /** Dia da semana do backup (0 = domingo) e hora local */
  weekday: z.number().int().min(0).max(6).default(0),
  hour: z.number().int().min(0).max(23).default(3),
  keepLast: z.number().int().min(1).max(52).default(8),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type PlantCreate = z.infer<typeof plantCreateSchema>;
export type PlantUpdate = z.infer<typeof plantUpdateSchema>;
export type LocationInput = z.infer<typeof locationInputSchema>;
export type ManualReadingInput = z.infer<typeof manualReadingSchema>;
export type EventCreate = z.infer<typeof eventCreateSchema>;
export type PhotoMeta = z.infer<typeof photoMetaSchema>;
export type TelegramSettings = z.infer<typeof telegramSettingsSchema>;
export type GoogleDriveSettings = z.infer<typeof googleDriveSettingsSchema>;
