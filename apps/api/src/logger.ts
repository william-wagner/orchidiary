import { resolve } from "node:path";
import pino from "pino";
import { env, isProd } from "./env.ts";
import { currentContext } from "./http/context.ts";
import { externalCallRecorder } from "./http/recorder.ts";
import { DbLogStream } from "./logging/dbStream.ts";

/**
 * Logger único da API.
 *  - stdout: legível em dev (pino-pretty), JSON em produção;
 *  - arquivo diário em LOG_DIR com rotação (tudo a partir de LOG_LEVEL);
 *  - tabela app_logs: só warn/error/fatal e auditoria (ver logging/dbStream.ts).
 * As chamadas a serviços externos têm tabela própria (external_calls, ver http/).
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
    // Todo log feito durante uma requisição ou rotina leva o requestId (e o usuário) dela, sem repassar por parâmetro.
    // Campos passados explicitamente na chamada prevalecem.
    mixin() {
      const ctx = currentContext();
      return ctx ? { requestId: ctx.requestId, ...(ctx.userId ? { userId: ctx.userId } : {}) } : {};
    },
  },
  pino.multistream([
    { stream: fileAndConsole, level: "trace" },
    { stream: dbStream, level: "trace" },
  ]),
);

/** Grava o que estiver nos buffers do banco (logs e chamadas externas). Use antes de encerrar o processo. */
export const flushLogs = () => Promise.all([dbStream.flush(), externalCallRecorder.flush()]).then(() => undefined);

/** Logger com a origem fixa (aparece na coluna `source`). */
export const sourceLogger = (source: string) => logger.child({ source });
