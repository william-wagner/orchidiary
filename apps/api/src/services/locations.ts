import { and, asc, eq, isNull } from "drizzle-orm";
import { type LocationInput, planMove } from "@orchidiary/shared";
import { db, schema } from "../db/client.ts";
import { pruneWeatherOutsidePeriods } from "./weather/collect.ts";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function listLocations(plantId: string, tx: Tx | typeof db = db) {
  return tx
    .select()
    .from(schema.plantLocations)
    .where(eq(schema.plantLocations.plantId, plantId))
    .orderBy(asc(schema.plantLocations.validFrom));
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
        label: input.label ?? null,
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
        data: {
          from: { lat: close.lat, lng: close.lng, label: close.label, environment: close.environment },
          to: { lat: input.lat, lng: input.lng, label: input.label ?? null, environment: input.environment },
        },
      });
    }
    return { created: created!, closedId: close?.id };
  });
  // O dia da mudança passa a pertencer ao local novo: tira esse dia do período antigo.
  if (created.closedId) await pruneWeatherOutsidePeriods([created.closedId]);
  return created.created;
}
