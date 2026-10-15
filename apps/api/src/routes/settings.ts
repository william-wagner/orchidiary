import { desc } from "drizzle-orm";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { googleDriveSettingsSchema, telegramSettingsSchema } from "@orchidiary/shared";
import { db, schema } from "../db/client.ts";
import { env, isProd } from "../env.ts";
import { type AppEnv, requireMaster, requireUser } from "../auth/session.ts";
import { zValidator } from "../lib/validate.ts";
import { runBackup } from "../services/backup.ts";
import { buildAuthUrl, exchangeCode, newOAuthState } from "../services/googleDrive.ts";
import { loadIntegration, publicView, saveIntegration } from "../services/integrations.ts";
import { sendTelegram } from "../services/telegram.ts";

const OAUTH_COOKIE = "orchidiary_gdrive_state";
const redirectUri = () => `${env.WEB_ORIGIN.replace(/\/$/, "")}/api/settings/google-drive/callback`;

/** Tudo aqui é exclusivo do usuário master. */
export const settingsRoutes = new Hono<AppEnv>()
  .use(requireUser, requireMaster)

  .get("/integrations", async (c) => {
    const [telegram, drive] = await Promise.all([loadIntegration("telegram"), loadIntegration("google_drive")]);
    return c.json({
      telegram: publicView(telegram),
      googleDrive: { ...publicView(drive), redirectUri: redirectUri() },
      secretsKeyConfigured: Boolean(env.SECRETS_KEY),
    });
  })

  // ─── Telegram ──────────────────────────────────────────────────────────────
  .put("/telegram", zValidator("json", telegramSettingsSchema), async (c) => {
    const { enabled, botToken, chatId } = c.req.valid("json");
    await saveIntegration("telegram", { enabled, config: { chatId }, secrets: { botToken } }, c.get("user").id);
    return c.json(publicView(await loadIntegration("telegram")));
  })

  .post("/telegram/test", async (c) => {
    const tg = await loadIntegration("telegram");
    if (!tg?.secrets.botToken || !tg.config.chatId) return c.json({ error: "Configure o token do bot e o chat id." }, 400);
    try {
      await sendTelegram(tg.secrets.botToken, tg.config.chatId, "🌸 Orchidiary conectado! Os alertas chegarão por aqui.");
      return c.json({ ok: true });
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 502);
    }
  })

  // ─── Google Drive ──────────────────────────────────────────────────────────
  .put("/google-drive", zValidator("json", googleDriveSettingsSchema), async (c) => {
    const { enabled, clientId, clientSecret, folderId, weekday, hour, keepLast } = c.req.valid("json");
    const previous = await loadIntegration("google_drive");
    // Trocar de client OAuth invalida o refresh token antigo
    const clientChanged = previous && previous.config.clientId !== clientId;
    await saveIntegration(
      "google_drive",
      {
        enabled,
        config: {
          clientId,
          folderId: folderId || previous?.config.folderId,
          weekday,
          hour,
          keepLast,
          connectedEmail: clientChanged ? undefined : previous?.config.connectedEmail,
        },
        secrets: { clientSecret },
        removeSecrets: clientChanged ? ["refreshToken"] : [],
      },
      c.get("user").id,
    );
    return c.json(publicView(await loadIntegration("google_drive")));
  })

  /** Inicia o OAuth: o app redireciona o navegador para a URL devolvida. */
  .get("/google-drive/connect", async (c) => {
    const drive = await loadIntegration("google_drive");
    if (!drive?.config.clientId || !drive.secrets.clientSecret) {
      return c.json({ error: "Salve o Client ID e o Client Secret antes de conectar." }, 400);
    }
    const state = newOAuthState();
    setCookie(c, OAUTH_COOKIE, state, { httpOnly: true, secure: isProd, sameSite: "Lax", path: "/api/settings", maxAge: 600 });
    return c.json({ url: buildAuthUrl({ clientId: drive.config.clientId, redirectUri: redirectUri(), state }) });
  })

  .get("/google-drive/callback", async (c) => {
    const back = (status: string) => c.redirect(`${env.WEB_ORIGIN.replace(/\/$/, "")}/configuracoes?drive=${status}`);
    const expected = getCookie(c, OAUTH_COOKIE);
    deleteCookie(c, OAUTH_COOKIE, { path: "/api/settings" });
    const { code, state, error } = c.req.query();
    if (error || !code || !state || state !== expected) return back("erro");

    const drive = await loadIntegration("google_drive");
    if (!drive?.secrets.clientSecret) return back("erro");
    try {
      const { refreshToken, email } = await exchangeCode({
        clientId: drive.config.clientId,
        clientSecret: drive.secrets.clientSecret,
        redirectUri: redirectUri(),
        code,
      });
      await saveIntegration(
        "google_drive",
        { enabled: true, config: { ...drive.config, connectedEmail: email }, secrets: { refreshToken } },
        c.get("user").id,
      );
      return back("ok");
    } catch (e) {
      console.error("[google-drive] callback:", e);
      return back("erro");
    }
  })

  .post("/google-drive/disconnect", async (c) => {
    const drive = await loadIntegration("google_drive");
    if (drive) {
      // mantém o client secret; remove só a autorização da conta
      await saveIntegration(
        "google_drive",
        { enabled: false, config: { ...drive.config, connectedEmail: undefined }, removeSecrets: ["refreshToken"] },
        c.get("user").id,
      );
    }
    return c.json({ ok: true });
  })

  // ─── Backups ───────────────────────────────────────────────────────────────
  .post("/backup/run", async (c) => c.json(await runBackup("manual")))

  .get("/backup/runs", async (c) =>
    c.json(await db.select().from(schema.backupRuns).orderBy(desc(schema.backupRuns.startedAt)).limit(20)),
  );
