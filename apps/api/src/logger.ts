import { resolve } from "node:path";
import pino from "pino";
import { env, isProd } from "./env.ts";
import { DbLogStream } from "./logging/dbStream.ts";

/**
 * Logger único da API.
 *  - stdout: legível em dev (pino-pretty), JSON em produção;
 *  - arquivo diário em LOG_DIR com rotação (tudo a partir de LOG_LEVEL);
 *  - tabela app_logs: só warn/error/fatal e auditoria (ver logging/dbStream.ts).
 * Arquivo e stdout rodam em uma worker thread (pino.transport): escrever log não bloqueia as requisições.
 */

const SECRET_KEYS = ["password", "passwordHash", "token", "botToken", "clientSecret", "refreshToken", "secrets"];

const dbStream = new DbLogStream();

const fileAndConsole = pino.transport({
  targets: [
    isProd
      ? { target: "pino/file", level: "trace", options: { destination: 1 } }
      : {
          target: "pino-pretty",
          level: "trace",
          options: { colorize: true, translateTime: "SYS:HH:MM:ss", ignore: "pid,hostname" },
        },
    {
      target: "pino-roll",
      level: "trace",
      options: {
        file: resolve(env.LOG_DIR, "api"),
        extension: ".log",
        frequency: "daily",
        dateFormat: "yyyy-MM-dd",
        mkdir: true,
        limit: { count: env.LOG_FILE_RETENTION_DAYS },
      },
    },
  ],
});

export const logger = pino(
  {
    level: env.LOG_LEVEL,
    // Nunca deixa segredos chegarem ao arquivo nem ao banco
    redact: {
      paths: [
        "req.headers.cookie",
        "req.headers.authorization",
        ...SECRET_KEYS.flatMap((k) => [k, `*.${k}`]), // no topo e um nível abaixo
      ],
      censor: "[redigido]",
    },
    base: undefined, // sem pid/hostname
  },
  pino.multistream([
    { stream: fileAndConsole, level: "trace" },
    { stream: dbStream, level: "trace" },
  ]),
);

/** Grava o que estiver no buffer do banco. Use antes de encerrar o processo. */
export const flushLogs = () => dbStream.flush();

/** Logger com a origem fixa (aparece na coluna `source`). */
export const sourceLogger = (source: string) => logger.child({ source });
