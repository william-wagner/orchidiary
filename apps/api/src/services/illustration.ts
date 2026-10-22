import { asc, eq, inArray, sql } from "drizzle-orm";
import sharp from "sharp";
import { illustrationPrompt, needsIllustration } from "@orchidiary/shared";
import { db, schema } from "../db/client.ts";
import { http } from "../http/clients.ts";
import { currentContext, type CallContext, runWithContext } from "../http/context.ts";
import { sourceLogger } from "../logger.ts";
import { loadIntegration, type OpenaiConfig } from "./integrations.ts";
import { storage } from "./storage.ts";

const { plants, photos, taxa } = schema;
const log = sourceLogger("ilustracao");

/** Paisagem 3:2: casa com a capa da ficha; no app a prancha é exibida inteira (object-contain) sobre papel da mesma cor. */
const SIZE = "1536x1024";
const THUMB_SIDE = 480;
const TIMEOUT_MS = 5 * 60 * 1000;

type Photo = typeof photos.$inferSelect;
interface Job {
  photo: Photo;
  taxon: string | null;
  /** Contexto de quem pediu: as chamadas à OpenAI feitas depois, em segundo plano, ainda apontam para a origem */
  ctx?: CallContext;
}

// Uma geração por vez: cada chamada custa dinheiro e leva de 20 s a alguns minutos.
const queue = new Map<string, Job>();
let draining = false;

/**
 * Garante a ilustração da capa atual das plantas indicadas (ou de todas).
 * A capa é a foto escolhida em cover_photo_id ou, na falta dela, a primeira da planta.
 */
export async function illustrateCovers(plantIds?: string[]): Promise<void> {
  const ai = await loadIntegration("openai");
  if (!ai?.enabled || !ai.secrets.apiKey) return;

  const plantRows = await db
    .select({
      id: plants.id,
      coverPhotoId: plants.coverPhotoId,
      taxon: sql<string | null>`coalesce(${taxa.fullName}, ${plants.taxonText})`,
    })
    .from(plants)
    .leftJoin(taxa, eq(taxa.id, plants.taxonId))
    .where(plantIds ? inArray(plants.id, plantIds) : undefined);
  if (!plantRows.length) return;
  const ids = plantRows.map((p) => p.id);

  const first = await db
    .selectDistinctOn([photos.plantId], { plantId: photos.plantId, id: photos.id })
    .from(photos)
    .where(inArray(photos.plantId, ids))
    .orderBy(photos.plantId, asc(photos.takenAt));
  const firstBy = new Map(first.map((p) => [p.plantId, p.id]));

  const coverIds = plantRows.map((p) => p.coverPhotoId ?? firstBy.get(p.id)).filter((id): id is string => !!id);
  if (!coverIds.length) return;
  const covers = await db.select().from(photos).where(inArray(photos.id, coverIds));
  const taxonBy = new Map(plantRows.map((p) => [p.id, p.taxon]));

  const now = new Date();
  for (const photo of covers) {
    if (queue.has(photo.id)) continue;
    if (!needsIllustration({ status: photo.illustrationStatus, updatedAt: photo.illustrationUpdatedAt }, now)) continue;
    queue.set(photo.id, { photo, taxon: taxonBy.get(photo.plantId) ?? null, ctx: currentContext() });
    // marca já, para o app mostrar que a prancha está a caminho e a varredura não enfileirar de novo
    await setStatus(photo.id, "pending");
  }
  void drain(ai.config, ai.secrets.apiKey);
}

/** Dispara a ilustração sem segurar a resposta da requisição. */
export function requestCoverIllustration(plantId: string): void {
  illustrateCovers([plantId]).catch((err) => log.error({ err, plantId }, "falha ao enfileirar a ilustração da capa"));
}

async function drain(config: OpenaiConfig, apiKey: string) {
  if (draining) return;
  draining = true;
  try {
    for (const [id, job] of queue) {
      try {
        await (job.ctx ? runWithContext(job.ctx, () => illustrate(job, config, apiKey)) : illustrate(job, config, apiKey));
      } catch (err) {
        await setStatus(id, "error");
        log.warn({ err, photoId: id, plantId: job.photo.plantId }, "falha ao gerar a ilustração da capa");
      } finally {
        queue.delete(id);
      }
    }
  } finally {
    draining = false;
  }
}

async function illustrate({ photo, taxon }: Job, config: OpenaiConfig, apiKey: string) {
  const started = Date.now();
  const original = await storage.get(photo.storageKey);

  const form = new FormData();
  form.set("model", config.model || "gpt-image-2");
  form.set("prompt", illustrationPrompt(taxon));
  form.set("size", SIZE);
  form.set("quality", config.quality || "medium");
  form.set("output_format", "webp");
  form.set("image", new Blob([new Uint8Array(original)], { type: photo.mimeType }), `${photo.id}.webp`);

  const model = String(form.get("model"));
  const quality = String(form.get("quality"));
  const b64 = await http.openai.call(
    {
      operation: "images.edits",
      url: "https://api.openai.com/v1/images/edits",
      init: { method: "POST", headers: { authorization: `Bearer ${apiKey}` }, body: form, signal: AbortSignal.timeout(TIMEOUT_MS) },
      meta: { model, quality, size: SIZE, photoId: photo.id, plantId: photo.plantId },
    },
    async (res, scope) => {
      const body = (await res.json().catch(() => ({}))) as {
        data?: Array<{ b64_json?: string }>;
        error?: { message?: string };
        usage?: unknown;
      };
      if (body.usage) scope.annotate({ usage: body.usage }); // base para estimar o custo das pranchas
      const image = body.data?.[0]?.b64_json;
      if (!res.ok || !image) throw new Error(`OpenAI ${res.status}: ${body.error?.message ?? "resposta sem imagem"}`);
      return image;
    },
  );

  const generated = sharp(Buffer.from(b64, "base64"));
  const full = await generated.clone().webp({ quality: 85 }).toBuffer();
  const thumb = await generated
    .clone()
    .resize(THUMB_SIDE, THUMB_SIDE, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 78 })
    .toBuffer();

  const base = photo.storageKey.replace(/\.webp$/, "");
  const illustrationKey = `${base}.illustration.webp`;
  const illustrationThumbKey = `${base}.illustration.thumb.webp`;
  await storage.put(illustrationKey, full);
  await storage.put(illustrationThumbKey, thumb);
  await db
    .update(photos)
    .set({ illustrationKey, illustrationThumbKey, illustrationStatus: "ready", illustrationUpdatedAt: new Date() })
    .where(eq(photos.id, photo.id));
  log.info({ photoId: photo.id, plantId: photo.plantId, ms: Date.now() - started, model: config.model }, "ilustração da capa pronta");
}

async function setStatus(photoId: string, status: "pending" | "error") {
  await db
    .update(photos)
    .set({ illustrationStatus: status, illustrationUpdatedAt: new Date() })
    .where(eq(photos.id, photoId));
}
