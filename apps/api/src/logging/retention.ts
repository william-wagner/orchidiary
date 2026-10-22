import { and, eq, lt, ne } from "drizzle-orm";
import { db, schema } from "../db/client.ts";
import { env } from "../env.ts";
import { sourceLogger } from "../logger.ts";

/** Auditoria fica mais tempo que os demais logs. */
export const AUDIT_RETENTION_DAYS = 365;

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);

/** Apaga logs vencidos de app_logs. Os arquivos são limpos pela própria rotação. */
export async function purgeOldLogs() {
  const others = await db
    .delete(schema.appLogs)
    .where(and(ne(schema.appLogs.level, "audit"), lt(schema.appLogs.createdAt, daysAgo(env.LOG_DB_RETENTION_DAYS))))
    .returning({ id: schema.appLogs.id });
  // qualquer registro (inclusive auditoria) além do prazo máximo
  const audits = await db
    .delete(schema.appLogs)
    .where(lt(schema.appLogs.createdAt, daysAgo(AUDIT_RETENTION_DAYS)))
    .returning({ id: schema.appLogs.id });
  sourceLogger("scheduler:logs").info({ removed: others.length + audits.length }, "limpeza de logs antigos");
}

/**
 * Apaga chamadas externas vencidas: as que deram certo saem primeiro (EXTERNAL_CALLS_RETENTION_DAYS);
 * as com falha ficam até EXTERNAL_CALLS_ERROR_RETENTION_DAYS (nunca menos que as bem-sucedidas).
 */
export async function purgeOldExternalCalls() {
  const t = schema.externalCalls;
  const okDays = env.EXTERNAL_CALLS_RETENTION_DAYS;
  const errorDays = Math.max(okDays, env.EXTERNAL_CALLS_ERROR_RETENTION_DAYS);
  const succeeded = await db
    .delete(t)
    .where(and(eq(t.outcome, "ok"), lt(t.startedAt, daysAgo(okDays))))
    .returning({ id: t.id });
  const failed = await db.delete(t).where(lt(t.startedAt, daysAgo(errorDays))).returning({ id: t.id });
  sourceLogger("scheduler:logs").info(
    { removedOk: succeeded.length, removedFailed: failed.length },
    "limpeza de chamadas externas antigas",
  );
}

/** Rotina diária de limpeza: logs e chamadas externas. */
export async function purgeExpiredRecords() {
  await purgeOldLogs();
  await purgeOldExternalCalls();
}
