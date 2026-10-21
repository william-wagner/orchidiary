import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import {
  climateSegments,
  type ClimateSegment,
  EMPTY_LOCALITY,
  type Environment,
  formatLocality,
  type Locality,
  type LocationInput,
  periodAt,
  planMove,
} from "@orchidiary/shared";
import { db, schema } from "../db/client.ts";
import { reverseGeocode } from "./geocode.ts";
import { placeOf } from "./places.ts";
import { pruneWeatherOutsidePeriods } from "./weather/collect.ts";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

type PlantPeriod = typeof schema.plantLocations.$inferSelect;
type PlacePeriod = typeof schema.placeLocations.$inferSelect;

/**
 * Período da planta com a localização e o ambiente já resolvidos: num lugar, os dele;
 * sem lugar, os da própria planta. É o que a API devolve, para o app não ter de decidir.
 */
export interface ResolvedPeriod extends Omit<PlantPeriod, "lat" | "lng" | "environment"> {
  lat: number;
  lng: number;
  environment: Environment;
  placeName: string | null;
}

/** Localização do lugar que vale para um instante (ou a atual, quando o período segue aberto). */
const placePeriodFor = (periods: PlacePeriod[], period: PlantPeriod) => {
  const instant = period.validTo ? new Date(period.validTo.getTime() - 1) : null;
  if (instant) return periodAt(periods, instant) ?? periods.at(-1) ?? null;
  return periods.find((p) => p.validTo === null) ?? periods.at(-1) ?? null;
};

/** Junta o período da planta com o do lugar; devolve null quando o lugar sumiu (não deve acontecer). */
export function resolvePeriod(
  period: PlantPeriod,
  place: { name: string; environment: Environment } | null,
  placePeriods: PlacePeriod[],
): ResolvedPeriod | null {
  if (!period.placeId) {
    if (period.lat == null || period.lng == null || !period.environment) return null;
    return { ...period, lat: period.lat, lng: period.lng, environment: period.environment, placeName: null };
  }
  const at = placePeriodFor(placePeriods, period);
  if (!place || !at) return null;
  return {
    ...period,
    lat: at.lat,
    lng: at.lng,
    city: at.city,
    state: at.state,
    stateCode: at.stateCode,
    country: at.country,
    countryCode: at.countryCode,
    environment: place.environment,
    placeName: place.name,
  };
}

/** Localizações dos lugares informados, em ordem de início. */
export async function placePeriodsOf(placeIds: Array<string | null>, tx: Tx | typeof db = db) {
  const ids = [...new Set(placeIds.filter((id): id is string => !!id))];
  if (!ids.length) return [] as PlacePeriod[];
  return tx
    .select()
    .from(schema.placeLocations)
    .where(inArray(schema.placeLocations.placeId, ids))
    .orderBy(asc(schema.placeLocations.validFrom));
}

/** Períodos de permanência da planta, com lugar, coordenadas e ambiente resolvidos. */
export async function listLocations(plantId: string, tx: Tx | typeof db = db): Promise<ResolvedPeriod[]> {
  const rows = await tx
    .select({ location: schema.plantLocations, place: schema.places })
    .from(schema.plantLocations)
    .leftJoin(schema.places, eq(schema.places.id, schema.plantLocations.placeId))
    .where(eq(schema.plantLocations.plantId, plantId))
    .orderBy(asc(schema.plantLocations.validFrom));
  const placePeriods = await placePeriodsOf(
    rows.map((r) => r.location.placeId),
    tx,
  );
  return rows.flatMap((r) => {
    const resolved = resolvePeriod(
      r.location,
      r.place && { name: r.place.name, environment: r.place.environment },
      placePeriods.filter((p) => p.placeId === r.location.placeId),
    );
    return resolved ? [resolved] : [];
  });
}

/** Trechos de fonte de clima da planta (lugar ou ela mesma), em ordem. */
export async function climateSegmentsOf(plantId: string, tx: Tx | typeof db = db): Promise<ClimateSegment[]> {
  const periods = await tx
    .select()
    .from(schema.plantLocations)
    .where(eq(schema.plantLocations.plantId, plantId))
    .orderBy(asc(schema.plantLocations.validFrom));
  const placePeriods = await placePeriodsOf(
    periods.map((p) => p.placeId),
    tx,
  );
  return climateSegments(periods, placePeriods as Array<PlacePeriod & { placeId: string }>);
}

export async function getCurrentLocation(plantId: string) {
  const [row] = await db
    .select()
    .from(schema.plantLocations)
    .where(and(eq(schema.plantLocations.plantId, plantId), isNull(schema.plantLocations.validTo)))
    .limit(1);
  return row;
}

/** Colunas de localidade a partir de uma `Locality` (null limpa todas). */
export const localityColumns = (l: Locality | null) => ({ ...EMPTY_LOCALITY, ...l });

/**
 * Preenche cidade/estado/país de um período de planta sem lugar que ainda não os tem.
 * Só completa essas colunas: as coordenadas nunca são tocadas. Sem resposta, tenta de novo depois.
 */
export async function ensureLocality<T extends ResolvedPeriod>(period: T): Promise<T> {
  if (period.placeId || period.city || period.state || period.country) return period;
  const found = await reverseGeocode(period.lat, period.lng);
  if (!found) return period;
  await db.update(schema.plantLocations).set(localityColumns(found)).where(eq(schema.plantLocations.id, period.id));
  return { ...period, ...found };
}

/** Colunas de `plant_locations` para um local novo: ou o lugar, ou a localização própria. */
async function periodColumns(input: LocationInput) {
  if (input.placeId) return { placeId: input.placeId, lat: null, lng: null, environment: null, ...EMPTY_LOCALITY };
  const locality = await reverseGeocode(input.lat!, input.lng!);
  return { placeId: null, lat: input.lat!, lng: input.lng!, environment: input.environment!, ...localityColumns(locality) };
}

/**
 * Muda a planta de lugar (ou de localização própria) a partir de `validFrom`.
 * Fecha o período atual e abre outro. Nunca edita o passado: o clima, as fotos e os
 * eventos continuam ligados a onde a planta estava quando aconteceram.
 */
export async function movePlant(plantId: string, userId: string, input: LocationInput) {
  // fora da transação: a chamada de rede não pode segurar conexão do banco
  const columns = await periodColumns(input);
  const created = await db.transaction(async (tx) => {
    const to = await placeOf(userId, input.placeId, tx);
    const periods = await listLocations(plantId, tx);
    const { close, validFrom } = planMove(periods, input.validFrom ?? new Date());

    if (close) {
      await tx.update(schema.plantLocations).set({ validTo: validFrom }).where(eq(schema.plantLocations.id, close.id));
    }

    const [created] = await tx.insert(schema.plantLocations).values({ plantId, ...columns, validFrom }).returning();

    if (close) {
      await tx.insert(schema.events).values({
        plantId,
        userId,
        type: "moved",
        occurredAt: validFrom,
        // o nome do lugar vai por extenso: o evento continua legível mesmo se o lugar for renomeado depois
        data: {
          from: {
            lat: close.lat,
            lng: close.lng,
            label: close.placeName,
            locality: formatLocality(close),
            environment: close.environment,
          },
          to: {
            lat: to?.location?.lat ?? columns.lat,
            lng: to?.location?.lng ?? columns.lng,
            label: to?.place.name ?? null,
            locality: to?.location ? formatLocality(to.location) : formatLocality(columns),
            environment: to?.place.environment ?? columns.environment,
          },
        },
      });
    }
    return { closedId: close?.id, period: created! };
  });
  // O dia da mudança passa a pertencer ao local novo: tira esse dia do período antigo.
  if (created.closedId) await pruneWeatherOutsidePeriods([created.closedId]);
  const periods = await listLocations(plantId);
  return periods.find((p) => p.id === created.period.id)!;
}
