import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().url(),
  API_PORT: z.coerce.number().int().default(8787),
  /** Endereço público do app (ex.: https://meu-pc.tailnet.ts.net). Usado em CORS e no retorno do login do Google. */
  WEB_ORIGIN: z.string().default("http://localhost:5173"),
  /** Pasta do build do app web, servida pela API em produção */
  WEB_DIST: z.string().default("../web/dist"),
  APP_TIMEZONE: z.string().default("America/Sao_Paulo"),
  STORAGE_DIR: z.string().default("./data/photos"),
  SECRETS_KEY: z.string().optional(),
  LOCATION_MISMATCH_METERS: z.coerce.number().positive().default(300),
  NODE_ENV: z.string().default("development"),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Variáveis de ambiente inválidas:", z.flattenError(parsed.error).fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === "production";
