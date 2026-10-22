import { createHttpClient } from "./client.ts";
import { externalCallRecorder } from "./recorder.ts";

/** Um cliente por serviço externo. Todo acesso à rede do app passa por aqui. */
const sink = externalCallRecorder;

export const http = {
  openMeteo: createHttpClient({ service: "open_meteo", sink }),
  nominatim: createHttpClient({ service: "nominatim", sink }),
  openai: createHttpClient({ service: "openai", sink }),
  telegram: createHttpClient({ service: "telegram", sink }),
  googleOAuth: createHttpClient({ service: "google_oauth", sink }),
  googleDrive: createHttpClient({ service: "google_drive", sink }),
} as const;
