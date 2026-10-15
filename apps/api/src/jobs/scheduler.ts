import { Cron } from "croner";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "../db/client.ts";
import { env } from "../env.ts";
import { sourceLogger } from "../logger.ts";
import { purgeOldLogs } from "../logging/retention.ts";
import { runForecastAlerts } from "../services/alerts.ts";
import { runBackup } from "../services/backup.ts";
import { illustrateCovers } from "../services/illustration.ts";
import { loadIntegration } from "../services/integrations.ts";
import { collectWeather } from "../services/weather/collect.ts";
import { shouldRunBackup } from "./backupSchedule.ts";

let backupRunning = false;

async function weatherJob() {
  const log = sourceLogger("scheduler:clima");
  const r = await collectWeather();
  const summary = { daysSaved: r.daysSaved, locations: r.locations };
  if (r.errors.length) log.warn({ ...summary, errors: r.errors }, "coleta de clima concluída com erros");
  else log.info(summary, `${r.daysSaved} dias de clima salvos em ${r.locations} locais`);
}

async function backupCheck() {
  if (backupRunning) return;
  const drive = await loadIntegration("google_drive");
  if (!drive?.enabled || !drive.secrets.refreshToken) return;
  const [last] = await db
    .select({ startedAt: schema.backupRuns.startedAt })
    .from(schema.backupRuns)
    .where(and(eq(schema.backupRuns.status, "success")))
    .orderBy(desc(schema.backupRuns.startedAt))
    .limit(1);
  const due = shouldRunBackup({
    now: new Date(),
    timeZone: env.APP_TIMEZONE,
    weekday: drive.config.weekday ?? 0,
    hour: drive.config.hour ?? 3,
    lastSuccessAt: last?.startedAt ?? null,
  });
  if (!due) return;
  backupRunning = true;
  try {
    // o resultado (sucesso ou erro) é registrado dentro de runBackup
    await runBackup("schedule");
  } finally {
    backupRunning = false;
  }
}

const safe = (name: string, fn: () => Promise<unknown>) => async () => {
  try {
    await fn();
  } catch (err) {
    sourceLogger(`scheduler:${name}`).error({ err }, `rotina "${name}" falhou`);
  }
};

export function startScheduler() {
  const tz = env.APP_TIMEZONE;
  const opts = { timezone: tz, protect: true };
  // Clima de ontem (com backfill de qualquer lacuna) — cedo, depois que a API fecha o dia
  new Cron("10 6 * * *", opts, safe("clima", weatherJob));
  // Previsão de frio/calor para amanhã → Telegram
  new Cron("0 18 * * *", opts, safe("alertas", () => runForecastAlerts()));
  // Backup semanal: checa toda hora (recupera se o PC estava desligado)
  new Cron("25 * * * *", opts, safe("backup", backupCheck));
  // Limpeza de app_logs vencidos
  new Cron("40 4 * * *", opts, safe("logs", purgeOldLogs));
  // Pranchas botânicas: retoma capas interrompidas e tenta de novo as que falharam (no máximo 1x por dia)
  new Cron("*/30 * * * *", opts, safe("ilustracao", () => illustrateCovers()));

  // Ao ligar o servidor, completa o que faltou enquanto o PC estava desligado
  setTimeout(safe("clima", weatherJob), 5_000);
  setTimeout(safe("backup", backupCheck), 60_000);
  setTimeout(safe("logs", purgeOldLogs), 120_000);
  setTimeout(safe("ilustracao", () => illustrateCovers()), 90_000);
  sourceLogger("scheduler").info({ timezone: tz }, `rotinas ativas no fuso ${tz}`);
}
