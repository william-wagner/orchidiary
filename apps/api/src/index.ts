import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import { env, isProd } from "./env.ts";
import { startScheduler } from "./jobs/scheduler.ts";
import { authRoutes } from "./routes/auth.ts";
import { photoRoutes } from "./routes/photos.ts";
import { plantRoutes } from "./routes/plants.ts";
import { settingsRoutes } from "./routes/settings.ts";
import { speciesRoutes } from "./routes/species.ts";

const api = new Hono()
  .get("/health", (c) => c.json({ ok: true, time: new Date().toISOString() }))
  .route("/auth", authRoutes)
  .route("/plants", plantRoutes)
  .route("/photos", photoRoutes)
  .route("/species", speciesRoutes)
  .route("/settings", settingsRoutes);

export type Api = typeof api;

const app = new Hono();
app.use(logger());
app.use("/api/*", cors({ origin: env.WEB_ORIGIN, credentials: true }));
app.route("/api", api);

app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  console.error(err);
  return c.json({ error: "Erro interno." }, 500);
});

// Em produção a própria API serve o app web (um único endereço para o Tailscale)
// (caminhos relativos à pasta apps/api, de onde o servidor é iniciado)
if (isProd && existsSync(resolve(env.WEB_DIST))) {
  app.use("/*", serveStatic({ root: env.WEB_DIST }));
  app.get("*", serveStatic({ path: `${env.WEB_DIST}/index.html` }));
}

serve({ fetch: app.fetch, port: env.API_PORT }, (info) => {
  console.log(`Orchidiary API em http://localhost:${info.port}`);
  startScheduler();
});
