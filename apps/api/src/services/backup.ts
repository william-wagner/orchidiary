import { promisify } from "node:util";
import { gzip } from "node:zlib";
import { eq, isNull } from "drizzle-orm";
import { toLocalDate } from "@orchidiary/shared";
import { db, schema } from "../db/client.ts";
import { env } from "../env.ts";
import { sourceLogger } from "../logger.ts";
import { DriveClient } from "./googleDrive.ts";
import { loadIntegration, saveIntegration } from "./integrations.ts";
import { storage } from "./storage.ts";
import { sendAlert } from "./telegram.ts";

const gzipAsync = promisify(gzip);
const log = sourceLogger("backup");
export const BACKUP_PREFIX = "orchidiary-backup-";

/**
 * Exporta o diário inteiro em JSON. Sessões e segredos de integração ficam de fora;
 * o hash de senha também não sai do servidor.
 */
export async function exportDiary() {
  const [users, taxa, places, placeLocations, plants, plantLocations, photos, events, weatherDaily, manualReadings, placeBatchExclusions] = await Promise.all([
    db.select({ id: schema.users.id, email: schema.users.email, name: schema.users.name, role: schema.users.role, createdAt: schema.users.createdAt }).from(schema.users),
    db.select().from(schema.taxa),
    db.select().from(schema.places),
    db.select().from(schema.placeLocations),
    db.select().from(schema.plants),
    db.select().from(schema.plantLocations),
    db.select().from(schema.photos),
    db.select().from(schema.events),
    db.select().from(schema.weatherDaily),
    db.select().from(schema.manualReadings),
    db.select().from(schema.placeBatchExclusions),
  ]);
  return {
    format: "orchidiary-backup",
    // 5: localização e ambiente no lugar (places.environment, place_locations, weather_daily.place_location_id)
    version: 5,
    exportedAt: new Date().toISOString(),
    tables: { users, taxa, places, placeLocations, plants, plantLocations, photos, events, weatherDaily, manualReadings, placeBatchExclusions },
  };
}

/**
 * Backup semanal no Google Drive:
 *  - Orchidiary/backups/orchidiary-backup-AAAA-MM-DD.json.gz  (dados completos, mantém os N últimos)
 *  - Orchidiary/fotos/<id>.webp  (incremental: cada foto sobe uma vez)
 */
export async function runBackup(trigger: "schedule" | "manual") {
  const [run] = await db.insert(schema.backupRuns).values({ trigger, status: "running" }).returning();
  try {
    const drive = await loadIntegration("google_drive");
    if (!drive?.enabled) throw new Error("Integração com o Google Drive desativada.");
    const { clientSecret, refreshToken } = drive.secrets;
    if (!clientSecret || !refreshToken) throw new Error("Google Drive não conectado.");

    const client = new DriveClient({ clientId: drive.config.clientId, clientSecret, refreshToken });

    let rootId = drive.config.folderId;
    if (!rootId) {
      rootId = await client.ensureFolder("Orchidiary");
      await saveIntegration("google_drive", { enabled: drive.enabled, config: { ...drive.config, folderId: rootId } }, null);
    }
    const backupsId = await client.ensureFolder("backups", rootId);
    const photosId = await client.ensureFolder("fotos", rootId);

    // 1. Dados
    const data = await gzipAsync(Buffer.from(JSON.stringify(await exportDiary())));
    const stamp = toLocalDate(new Date(), env.APP_TIMEZONE);
    const uploaded = await client.upload({
      name: `${BACKUP_PREFIX}${stamp}.json.gz`,
      mimeType: "application/gzip",
      data,
      parentId: backupsId,
    });

    // 2. Fotos novas
    const pending = await db.select().from(schema.photos).where(isNull(schema.photos.driveFileId));
    for (const photo of pending) {
      const file = await client.upload({
        name: `${photo.id}.webp`,
        mimeType: photo.mimeType,
        data: await storage.get(photo.storageKey),
        parentId: photosId,
      });
      await db.update(schema.photos).set({ driveFileId: file.id }).where(eq(schema.photos.id, photo.id));
    }

    // 3. Retenção
    const existing = await client.listFiles(backupsId, BACKUP_PREFIX);
    for (const old of existing.slice(drive.config.keepLast ?? 8)) await client.delete(old.id);

    await db
      .update(schema.backupRuns)
      .set({ status: "success", finishedAt: new Date(), driveFileId: uploaded.id, sizeBytes: uploaded.size })
      .where(eq(schema.backupRuns.id, run!.id));
    log.info({ trigger, photosUploaded: pending.length, sizeBytes: uploaded.size }, "backup concluído");
    return { ok: true as const, photosUploaded: pending.length, sizeBytes: uploaded.size };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log.error({ err: e, trigger, runId: run!.id }, "backup falhou");
    await db.update(schema.backupRuns).set({ status: "error", finishedAt: new Date(), error: message }).where(eq(schema.backupRuns.id, run!.id));
    const master = await masterId();
    if (master) {
      await sendAlert({
        userId: master,
        kind: "backup_failed",
        message: `⚠️ Backup do Orchidiary falhou: ${message}`,
        dedupeKey: `backup_failed:${run!.id}`,
      });
    }
    return { ok: false as const, error: message };
  }
}

async function masterId(): Promise<string | undefined> {
  const [m] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.role, "master")).limit(1);
  return m?.id;
}
