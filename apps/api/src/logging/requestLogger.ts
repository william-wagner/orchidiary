import { randomUUID } from "node:crypto";
import { createMiddleware } from "hono/factory";
import { logger } from "../logger.ts";
import type { SessionUser } from "../auth/session.ts";

export type RequestEnv = { Variables: { requestId: string; user?: SessionUser } };

const httpLogger = logger.child({ source: "http" });

/**
 * Dá um id a cada requisição (header X-Request-Id) e registra uma linha ao final:
 * método, caminho, status, duração e usuário. Só o caminho é gravado: a query string pode
 * trazer códigos (ex.: retorno do OAuth) e o corpo nunca é logado.
 */
export const requestLogger = createMiddleware<RequestEnv>(async (c, next) => {
  const requestId = randomUUID();
  c.set("requestId", requestId);
  c.header("X-Request-Id", requestId);
  const started = performance.now();

  await next();

  const path = c.req.path;
  const fields = {
    requestId,
    userId: c.get("user")?.id,
    method: c.req.method,
    path,
    status: c.res.status,
    ms: Math.round(performance.now() - started),
  };
  // /health é chamado com frequência; fica só no nível debug
  if (path === "/api/health") httpLogger.debug(fields, "requisição");
  else httpLogger.info(fields, "requisição");
});
