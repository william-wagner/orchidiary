import { and, asc, eq, isNull } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { planMove, type PlaceLocationInput } from "@orchidiary/shared";
import { db, schema } from "../db/client.ts";
import { reverseGeocode } from "./geocode.ts";

const { places, placeLocations } = schema;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Lugar do usuário com a localização atual; 400 se o id não existe ou é de outra pessoa. */
export async function placeOf(userId: string, placeId: string | null | undefined, tx: Tx | typeof db = db) {
  if (!placeId) return null;
  const [row] = await tx
    .select({ place: places, location: placeLocations })
    .from(places)
    .leftJoin(placeLocations, and(eq(placeLocations.placeId, places.id), isNull(placeLocations.validTo)))
    .where(and(eq(places.id, placeId), eq(places.userId, userId)))
    .limit(1);
  if (!row) throw new HTTPException(400, { message: "Esse lugar não existe." });
  return row;
}

/** Nome do lugar (null sem id). Mantido para quem só precisa do rótulo. */
export const placeNameOf = async (userId: string, placeId: string | null | undefined, tx: Tx | typeof db = db) =>
  (await placeOf(userId, placeId, tx))?.place.name ?? null;

export const listPlaceLocations = (placeId: string, tx: Tx | typeof db = db) =>
  tx.select().from(placeLocations).where(eq(placeLocations.placeId, placeId)).orderBy(asc(placeLocations.validFrom));

/** Primeira localização do lugar, aberta a partir de `validFrom` (ou de agora). */
export async function createPlaceLocation(
  placeId: string,
  input: { lat: number; lng: number; validFrom?: Date },
  tx: Tx | typeof db = db,
) {
  const locality = await reverseGeocode(input.lat, input.lng);
  const [created] = await tx
    .insert(placeLocations)
    .values({ placeId, lat: input.lat, lng: input.lng, ...locality, validFrom: input.validFrom ?? new Date() })
    .returning();
  return created!;
}

/**
 * Muda a localização do lugar: fecha o período atual e abre outro.
 * Nada é reescrito — o clima já coletado continua no período anterior, e as plantas
 * daqui passam a usar a nova coordenada só a partir da data informada.
 */
export async function movePlace(placeId: string, input: PlaceLocationInput) {
  const locality = await reverseGeocode(input.lat, input.lng);
  return db.transaction(async (tx) => {
    const periods = await listPlaceLocations(placeId, tx);
    const { close, validFrom } = planMove(periods, input.validFrom ?? new Date());
    if (close) {
      await tx.update(placeLocations).set({ validTo: validFrom }).where(eq(placeLocations.id, close.id));
    }
    const [created] = await tx
      .insert(placeLocations)
      .values({ placeId, lat: input.lat, lng: input.lng, ...locality, validFrom })
      .returning();
    return created!;
  });
}

const pgCode = (e: unknown) => {
  const err = e as { code?: string; cause?: { code?: string } };
  return err?.code ?? err?.cause?.code;
};
export const isUniqueViolation = (e: unknown) => pgCode(e) === "23505";
export const isForeignKeyViolation = (e: unknown) => pgCode(e) === "23503";
