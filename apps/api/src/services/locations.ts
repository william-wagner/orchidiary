import { and, asc, eq, isNull } from "drizzle-orm";
import { EMPTY_LOCALITY, formatLocality, type Locality, type LocationInput, planMove } from "@orchidiary/shared";
import { db, schema } from "../db/client.ts";
import { reverseGeocode } from "./geocode.ts";
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

/** Colunas de localidade de `plant_locations` a partir de uma `Locality` (null limpa todas). */
export const localityColumns = (l: Locality | null) => ({ ...EMPTY_LOCALITY, ...l });

/**
 * Preenche cidade/estado/país de um período que ainda não os tem (criado antes desse recurso
 * ou quando a geocodificação estava fora do ar). Só completa essas colunas: as coordenadas
 * nunca são tocadas. Sem resposta, deixa como está e tenta de novo na próxima vez.
 */
export async function ensureLocality<
  T extends { id: string; lat: number; lng: number; city: string | null; state: string | null; country: string | null },
>(period: T): Promise<T> {
  if (period.city || period.state || period.country) return period;
  const found = await reverseGeocode(period.lat, period.lng);
  if (!found) return period;
  await db.update(schema.plantLocations).set(localityColumns(found)).where(eq(schema.plantLocations.id, period.id));
  return { ...period, ...found };
}

/**
 * Muda a planta de lugar (ou de ambiente indoor/outdoor) a partir de `validFrom`.
 * Fecha o período atual e abre outro. Nunca edita coordenadas antigas: o clima,
 * as fotos e os eventos do passado continuam ligados ao local onde aconteceram.
 */
export async function movePlant(plantId: string, userId: string, input: LocationInput) {
  // fora da transação: a chamada de rede não pode segurar conexão do banco
  const locality = await reverseGeocode(input.lat, input.lng);
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
        ...localityColumns(locality),
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
          from: { lat: close.lat, lng: close.lng, label: close.placeName, locality: formatLocality(close), environment: close.environment },
          to: { lat: input.lat, lng: input.lng, label: toPlaceName, locality: formatLocality(locality), environment: input.environment },
        },
      });
    }
    return { created: { ...created!, placeName: toPlaceName }, closedId: close?.id };
  });
  // O dia da mudança passa a pertencer ao local novo: tira esse dia do período antigo.
  if (created.closedId) await pruneWeatherOutsidePeriods([created.closedId]);
  return created.created;
}
