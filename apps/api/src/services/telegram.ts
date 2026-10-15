import { eq } from "drizzle-orm";
import { db, schema } from "../db/client.ts";
import { loadIntegration } from "./integrations.ts";

/** Envia uma mensagem pelo Bot API do Telegram (HTML simples). */
export async function sendTelegram(
  botToken: string,
  chatId: string,
  text: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const res = await fetchImpl(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string };
  if (!res.ok || !body.ok) throw new Error(`Telegram: ${body.description ?? res.status}`);
}

/**
 * Registra e envia um alerta. `dedupeKey` garante que o mesmo alerta
 * (ex.: "frio:<planta>:<data>") não seja enviado duas vezes.
 */
export async function sendAlert(a: {
  userId: string;
  plantId?: string | null;
  kind: string;
  message: string;
  dedupeKey: string;
}): Promise<"sent" | "duplicate" | "disabled" | "error"> {
  const inserted = await db
    .insert(schema.alerts)
    .values({ ...a, plantId: a.plantId ?? null, channel: "telegram" })
    .onConflictDoNothing()
    .returning({ id: schema.alerts.id });
  const row = inserted[0];
  if (!row) return "duplicate";

  const tg = await loadIntegration("telegram");
  if (!tg?.enabled || !tg.secrets.botToken || !tg.config.chatId) {
    await db.update(schema.alerts).set({ error: "Telegram desativado" }).where(eq(schema.alerts.id, row.id));
    return "disabled";
  }
  try {
    await sendTelegram(tg.secrets.botToken, tg.config.chatId, a.message);
    await db.update(schema.alerts).set({ sentAt: new Date() }).where(eq(schema.alerts.id, row.id));
    return "sent";
  } catch (e) {
    await db
      .update(schema.alerts)
      .set({ error: e instanceof Error ? e.message : String(e) })
      .where(eq(schema.alerts.id, row.id));
    return "error";
  }
}

export { escapeHtml } from "../lib/html.ts";
