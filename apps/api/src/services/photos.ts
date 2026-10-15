import exifr from "exifr";
import sharp from "sharp";
import { checkPhotoLocation, currentPeriod, periodAt, type PhotoMeta } from "@orchidiary/shared";
import { db, schema } from "../db/client.ts";
import { env } from "../env.ts";
import { listLocations } from "./locations.ts";
import { newPhotoKey, storage } from "./storage.ts";

const MAX_SIDE = 2048;
const THUMB_SIDE = 480;

interface ExifInfo {
  takenAt?: Date;
  lat?: number;
  lng?: number;
}

async function readExif(buf: Buffer): Promise<ExifInfo> {
  try {
    const data = await exifr.parse(buf, { gps: true, pick: ["DateTimeOriginal", "latitude", "longitude"] });
    if (!data) return {};
    return {
      takenAt: data.DateTimeOriginal instanceof Date ? data.DateTimeOriginal : undefined,
      lat: typeof data.latitude === "number" ? data.latitude : undefined,
      lng: typeof data.longitude === "number" ? data.longitude : undefined,
    };
  } catch {
    return {};
  }
}

export interface LocationSuggestion {
  mismatch: boolean;
  distanceMeters: number;
  photoLocation: { lat: number; lng: number };
  plantLocation: { id: string; lat: number; lng: number; placeName: string | null; environment: string };
  /**
   * Se a planta pode ser movida a partir do momento da foto. Falso quando a foto
   * é anterior ao início do local atual — mover seria retroativo.
   */
  canMoveFromPhoto: boolean;
}

export async function savePhoto(params: { plantId: string; userId: string; file: File; meta: PhotoMeta }) {
  const { plantId, userId, file, meta } = params;
  const original = Buffer.from(await file.arrayBuffer());

  // Câmera: o app envia GPS e horário do aparelho. Upload: tentamos o EXIF.
  const exif = await readExif(original);
  const takenAt = meta.takenAt ?? exif.takenAt ?? new Date();
  const lat = meta.lat ?? exif.lat;
  const lng = meta.lng ?? exif.lng;

  // Corrige orientação, limita tamanho e remove metadados (privacidade se o app ficar público).
  const pipeline = sharp(original).rotate();
  const full = await pipeline.clone().resize(MAX_SIDE, MAX_SIDE, { fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
  const thumb = await pipeline.clone().resize(THUMB_SIDE, THUMB_SIDE, { fit: "inside", withoutEnlargement: true }).webp({ quality: 75 }).toBuffer();

  const storageKey = newPhotoKey(plantId, "webp");
  const thumbKey = storageKey.replace(/\.webp$/, ".thumb.webp");
  await storage.put(storageKey, full.data);
  await storage.put(thumbKey, thumb);

  const periods = await listLocations(plantId);
  const period = periodAt(periods, takenAt) ?? currentPeriod(periods);

  let suggestion: LocationSuggestion | null = null;
  if (period && lat != null && lng != null) {
    const check = checkPhotoLocation(period, { lat, lng, accuracyMeters: meta.accuracy }, env.LOCATION_MISMATCH_METERS);
    const current = currentPeriod(periods);
    suggestion = {
      mismatch: check.mismatch,
      distanceMeters: check.distanceMeters,
      photoLocation: { lat, lng },
      plantLocation: { id: period.id, lat: period.lat, lng: period.lng, placeName: period.placeName, environment: period.environment },
      canMoveFromPhoto: !!current && period.id === current.id && takenAt.getTime() > current.validFrom.getTime(),
    };
  }

  const [photo] = await db
    .insert(schema.photos)
    .values({
      plantId,
      userId,
      storageKey,
      thumbKey,
      mimeType: "image/webp",
      width: full.info.width,
      height: full.info.height,
      sizeBytes: full.info.size,
      takenAt,
      source: meta.source,
      lat: lat ?? null,
      lng: lng ?? null,
      accuracy: meta.accuracy ?? null,
      locationId: period?.id ?? null,
      distanceFromPlantM: suggestion?.distanceMeters ?? null,
      caption: meta.caption ?? null,
    })
    .returning();

  return { photo: photo!, locationCheck: suggestion };
}
