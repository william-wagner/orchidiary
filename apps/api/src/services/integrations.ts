import { eq } from "drizzle-orm";
import type { IllustrationQuality, Integration } from "@orchidiary/shared";
import { db, schema } from "../db/client.ts";
import { env } from "../env.ts";
import { decryptJson, encryptJson } from "../lib/secrets.ts";

export interface TelegramConfig {
  chatId: string;
}
export interface TelegramSecrets {
  botToken: string;
}

export interface DriveConfig {
  clientId: string;
  folderId?: string;
  weekday: number;
  hour: number;
  keepLast: number;
  connectedEmail?: string;
}
export interface DriveSecrets {
  clientSecret: string;
  refreshToken?: string;
}

export interface OpenaiConfig {
  model: string;
  quality: IllustrationQuality;
}
export interface OpenaiSecrets {
  apiKey: string;
}

type ConfigOf<K extends Integration> = K extends "telegram" ? TelegramConfig : K extends "openai" ? OpenaiConfig : DriveConfig;
type SecretsOf<K extends Integration> = K extends "telegram" ? TelegramSecrets : K extends "openai" ? OpenaiSecrets : DriveSecrets;

export interface LoadedIntegration<K extends Integration> {
  enabled: boolean;
  config: ConfigOf<K>;
  secrets: Partial<SecretsOf<K>>;
}

export async function loadIntegration<K extends Integration>(key: K): Promise<LoadedIntegration<K> | null> {
  const [row] = await db.select().from(schema.integrationSettings).where(eq(schema.integrationSettings.key, key)).limit(1);
  if (!row) return null;
  return {
    enabled: row.enabled,
    config: row.config as unknown as ConfigOf<K>,
    secrets: row.secretsEnc ? decryptJson<Partial<SecretsOf<K>>>(row.secretsEnc, env.SECRETS_KEY) : {},
  };
}

/** Salva configuração; segredos omitidos mantêm o valor anterior. */
export async function saveIntegration<K extends Integration>(
  key: K,
  input: {
    enabled: boolean;
    config: ConfigOf<K>;
    secrets?: Partial<SecretsOf<K>>;
    /** Segredos a apagar (ex.: refresh token ao desconectar) */
    removeSecrets?: Array<keyof SecretsOf<K>>;
  },
  userId: string | null,
): Promise<void> {
  const previous = await loadIntegration(key);
  const merged: Record<string, unknown> = { ...(previous?.secrets ?? {}), ...stripUndefined(input.secrets ?? {}) };
  for (const k of input.removeSecrets ?? []) delete merged[k as string];
  const values = {
    enabled: input.enabled,
    config: input.config as unknown as Record<string, unknown>,
    secretsEnc: Object.keys(merged).length ? encryptJson(merged, env.SECRETS_KEY) : null,
    updatedAt: new Date(),
    updatedBy: userId,
  };
  await db
    .insert(schema.integrationSettings)
    .values({ key, ...values })
    .onConflictDoUpdate({ target: schema.integrationSettings.key, set: values });
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== "")) as Partial<T>;
}

/** Visão segura para a tela de configurações: nunca devolve segredos, só se existem. */
export function publicView<K extends Integration>(loaded: LoadedIntegration<K> | null) {
  if (!loaded) return { enabled: false, configured: false, config: null, hasSecrets: {} };
  return {
    enabled: loaded.enabled,
    configured: true,
    config: loaded.config,
    hasSecrets: Object.fromEntries(Object.entries(loaded.secrets).map(([k, v]) => [k, Boolean(v)])),
  };
}
