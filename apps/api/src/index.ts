import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { secureHeaders } from "hono/secure-headers";
import { env, isProd } from "./env.ts";
import { startScheduler } from "./jobs/scheduler.ts";
import { flushLogs, logger } from "./logger.ts";
import { type RequestEnv, requestLogger } from "./logging/requestLogger.ts";
import { authRoutes } from "./routes/auth.ts";
import { geoRoutes } from "./routes/geo.ts";
import { photoRoutes } from "./routes/photos.ts";
import { placeRoutes } from "./routes/places.ts";
import { plantRoutes } from "./routes/plants.ts";
import { settingsRoutes } from "./routes/settings.ts";
import { taxaRoutes } from "./routes/taxa.ts";

const api = new Hono()
  .get("/health", (c) => c.json({ ok: true, time: new Date().toISOString() }))
  .route("/auth", authRoutes)
  .route("/plants", plantRoutes)
  .route("/geo", geoRoutes)
  .route("/places", placeRoutes)
  .route("/photos", photoRoutes)
  .route("/taxa", taxaRoutes)
  .route("/settings", settingsRoutes);

export type Api = typeof api;

const app = new Hono<RequestEnv>();
app.use(requestLogger);
// HSTS só em produção, onde há HTTPS na frente
app.use(secureHeaders({ strictTransportSecurity: isProd ? "max-age=31536000; includeSubDomains" : false }));
app.use("/api/*", cors({ origin: env.WEB_ORIGIN, credentials: true, exposeHeaders: ["X-Request-Id"] }));
app.route("/api", api);

app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  logger.error(
    { err, source: "http", requestId: c.get("requestId"), userId: c.get("user")?.id, method: c.req.method, path: c.req.path },
    "erro não tratado na requisição",
  );
  return c.json({ error: "Erro interno.", requestId: c.get("requestId") }, 500);
});

// Em produção a própria API serve o app web (um único endereço para o Tailscale)
// (caminhos relativos à pasta apps/api, de onde o servidor é iniciado)
if (isProd && existsSync(resolve(env.WEB_DIST))) {
  app.use("/*", serveStatic({ root: env.WEB_DIST }));
  app.get("*", serveStatic({ path: `${env.WEB_DIST}/index.html` }));
}

const server = serve({ fetch: app.fetch, port: env.API_PORT }, (info) => {
  logger.info({ source: "app", port: info.port, env: env.NODE_ENV }, `Orchidiary API em http://localhost:${info.port}`);
  startScheduler();
});

// Encerramento: grava o que ainda está no buffer do banco antes de sair
let closing = false;
async function shutdown(code: number) {
  if (closing) return;
  closing = true;
  server.close();
  await Promise.race([flushLogs(), new Promise((r) => setTimeout(r, 3_000))]);
  process.exit(code);
}
process.on("SIGINT", () => void shutdown(0));
process.on("SIGTERM", () => void shutdown(0));
process.on("uncaughtException", (err) => {
  logger.fatal({ err, source: "process" }, "exceção não capturada");
  void shutdown(1);
});
process.on("unhandledRejection", (reason) => {
  logger.fatal({ err: reason, source: "process" }, "promessa rejeitada sem tratamento");
  void shutdown(1);
});
