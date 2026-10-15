import { and, desc, eq, gte, ilike, lt, lte, or, type SQL } from "drizzle-orm";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import { googleDriveSettingsSchema, openaiSettingsSchema, telegramSettingsSchema } from "@orchidiary/shared";
import { db, schema } from "../db/client.ts";
import { env, isProd } from "../env.ts";
import { type AppEnv, requireMaster, requireUser } from "../auth/session.ts";
import { zValidator } from "../lib/validate.ts";
import { sourceLogger } from "../logger.ts";
import { audit } from "../logging/audit.ts";
import { runBackup } from "../services/backup.ts";
import { buildAuthUrl, exchangeCode, newOAuthState } from "../services/googleDrive.ts";
import { illustrateCovers } from "../services/illustration.ts";
import { loadIntegration, publicView, saveIntegration } from "../services/integrations.ts";
import { sendTelegram } from "../services/telegram.ts";

const OAUTH_COOKIE = "orchidiary_gdrive_state";
const redirectUri = () => `${env.WEB_ORIGIN.replace(/\/$/, "")}/api/settings/google-drive/callback`;
const log = sourceLogger("google-drive");

const logsQuery = z.object({
  level: z.enum(["warn", "error", "fatal", "audit"]).optional(),
  source: z.string().max(100).optional(),
  q: z.string().max(200).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  /** "<epoch ms>_<id>" do último item da página anterior */
  cursor: z.string().regex(/^\d+_[0-9a-f-]{36}$/).optional(),
});

const escapeLike = (s: string) => s.replace(/[\\%_]/g, "\\$&");

/** Tudo aqui é exclusivo do usuário master. */
export const settingsRoutes = new Hono<AppEnv>()
  .use(requireUser, requireMaster)

  .get("/integrations", async (c) => {
    const [telegram, drive, openai] = await Promise.all([
      loadIntegration("telegram"),
      loadIntegration("google_drive"),
      loadIntegration("openai"),
    ]);
    return c.json({
      telegram: publicView(telegram),
      googleDrive: { ...publicView(drive), redirectUri: redirectUri() },
      openai: publicView(openai),
      secretsKeyConfigured: Boolean(env.SECRETS_KEY),
    });
  })

  // ─── Telegram ──────────────────────────────────────────────────────────────
  .put("/telegram", zValidator("json", telegramSettingsSchema), async (c) => {
    const { enabled, botToken, chatId } = c.req.valid("json");
    await saveIntegration("telegram", { enabled, config: { chatId }, secrets: { botToken } }, c.get("user").id);
    audit(c, { event: "settings.telegram.update", message: "integração Telegram atualizada", context: { enabled } });
    return c.json(publicView(await loadIntegration("telegram")));
  })

  .post("/telegram/test", async (c) => {
    const tg = await loadIntegration("telegram");
    if (!tg?.secrets.botToken || !tg.config.chatId) return c.json({ error: "Configure o token do bot e o chat id." }, 400);
    try {
      await sendTelegram(tg.secrets.botToken, tg.config.chatId, "🌸 Orchidiary conectado! Os alertas chegarão por aqui.");
      return c.json({ ok: true });
    } catch (e) {
      sourceLogger("telegram").warn({ err: e, requestId: c.get("requestId") }, "falha ao enviar a mensagem de teste");
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 502);
    }
  })

  // ─── OpenAI (pranchas botânicas das capas) ─────────────────────────────────
  .put("/openai", zValidator("json", openaiSettingsSchema), async (c) => {
    const { enabled, apiKey, model, quality } = c.req.valid("json");
    await saveIntegration("openai", { enabled, config: { model, quality }, secrets: { apiKey } }, c.get("user").id);
    audit(c, { event: "settings.openai.update", message: "integração OpenAI atualizada", context: { enabled, model, quality } });
    // ao ativar, as capas que ainda não têm prancha entram na fila
    if (enabled) {
      illustrateCovers().catch((err) =>
        sourceLogger("ilustracao").error({ err, requestId: c.get("requestId") }, "falha ao enfileirar as ilustrações"),
      );
    }
    return c.json(publicView(await loadIntegration("openai")));
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
    audit(c, {
      event: "settings.google-drive.update",
      message: "integração Google Drive atualizada",
      context: { enabled, weekday, hour, keepLast, clientChanged: Boolean(clientChanged) },
    });
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
      audit(c, { event: "settings.google-drive.connect", message: "conta do Google Drive conectada", context: { email } });
      return back("ok");
    } catch (e) {
      log.error({ err: e, requestId: c.get("requestId"), userId: c.get("user").id }, "falha no retorno do OAuth do Google Drive");
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
      audit(c, { event: "settings.google-drive.disconnect", message: "conta do Google Drive desconectada" });
    }
    return c.json({ ok: true });
  })

  // ─── Backups ───────────────────────────────────────────────────────────────
  .post("/backup/run", async (c) => {
    audit(c, { event: "backup.manual", message: "backup manual iniciado" });
    return c.json(await runBackup("manual"));
  })

  .get("/backup/runs", async (c) =>
    c.json(await db.select().from(schema.backupRuns).orderBy(desc(schema.backupRuns.startedAt)).limit(20)),
  )

  // ─── Logs (tabela app_logs: warn/error e auditoria) ────────────────────────
  .get("/logs", zValidator("query", logsQuery), async (c) => {
    const { level, source, q, from, to, limit, cursor } = c.req.valid("query");
    const t = schema.appLogs;
    const filters: (SQL | undefined)[] = [
      level ? eq(t.level, level) : undefined,
      source ? ilike(t.source, `${escapeLike(source)}%`) : undefined,
      q ? ilike(t.message, `%${escapeLike(q)}%`) : undefined,
      from ? gte(t.createdAt, from) : undefined,
      to ? lte(t.createdAt, to) : undefined,
    ];
    if (cursor) {
      const [ms, id] = cursor.split("_") as [string, string];
      const at = new Date(Number(ms));
      // created_at é gravado com precisão de milissegundo, então o par (data, id) ordena sem lacunas
      filters.push(or(lt(t.createdAt, at), and(eq(t.createdAt, at), lt(t.id, id))));
    }
    const rows = await db
      .select()
      .from(t)
      .where(and(...filters))
      .orderBy(desc(t.createdAt), desc(t.id))
      .limit(limit + 1);
    const items = rows.slice(0, limit);
    const last = items.at(-1);
    return c.json({
      items,
      nextCursor: rows.length > limit && last ? `${last.createdAt.getTime()}_${last.id}` : null,
    });
  });
