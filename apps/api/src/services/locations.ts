import { and, asc, eq, isNull } from "drizzle-orm";
import { type LocationInput, planMove } from "@orchidiary/shared";
import { db, schema } from "../db/client.ts";
import { placeNameOf } from "./places.ts";
import { pruneWeatherOutsidePeriods } from "./weather/collect.ts";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Períodos de local da planta, cada um com o nome do lugar (`placeName`) quando há. */
export async function listLocations(plantId: string, tx: Tx | typeof db = db) {
  const rows = await tx
    .select({ location: schema.plantLocations, placeName: schema.places.name })
    .from(schema.plantLocations)
    .leftJoin(schema.places, eq(schema.places.id, schema.plantLocations.placeId))
    .where(eq(schema.plantLocations.plantId, plantId))
    .orderBy(asc(schema.plantLocations.validFrom));
  return rows.map((r) => ({ ...r.location, placeName: r.placeName }));
}

export async function getCurrentLocation(plantId: string) {
  const [row] = await db
    .select()
    .from(schema.plantLocations)
    .where(and(eq(schema.plantLocations.plantId, plantId), isNull(schema.plantLocations.validTo)))
    .limit(1);
  return row;
}

/**
 * Muda a planta de lugar (ou de ambiente indoor/outdoor) a partir de `validFrom`.
 * Fecha o período atual e abre outro. Nunca edita coordenadas antigas: o clima,
 * as fotos e os eventos do passado continuam ligados ao local onde aconteceram.
 */
export async function movePlant(plantId: string, userId: string, input: LocationInput) {
  const created = await db.transaction(async (tx) => {
    const toPlaceName = await placeNameOf(userId, input.placeId, tx);
    const periods = await listLocations(plantId, tx);
    const { close, validFrom } = planMove(periods, input.validFrom ?? new Date());

    if (close) {
      await tx
        .update(schema.plantLocations)
        .set({ validTo: validFrom })
        .where(eq(schema.plantLocations.id, close.id));
    }

    const [created] = await tx
      .insert(schema.plantLocations)
      .values({
        plantId,
        lat: input.lat,
        lng: input.lng,
        placeId: input.placeId ?? null,
        environment: input.environment,
        validFrom,
      })
      .returning();

    if (close) {
      await tx.insert(schema.events).values({
        plantId,
        userId,
        type: "moved",
        occurredAt: validFrom,
        // o nome do lugar vai por extenso: o evento continua legível mesmo se o lugar for renomeado depois
        data: {
          from: { lat: close.lat, lng: close.lng, label: close.placeName, environment: close.environment },
          to: { lat: input.lat, lng: input.lng, label: toPlaceName, environment: input.environment },
        },
      });
    }
    return { created: { ...created!, placeName: toPlaceName }, closedId: close?.id };
  });
  // O dia da mudança passa a pertencer ao local novo: tira esse dia do período antigo.
  if (created.closedId) await pruneWeatherOutsidePeriods([created.closedId]);
  return created.created;
}
