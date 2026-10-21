import { and, eq, gte, inArray, isNotNull, isNull, lte, ne } from "drizzle-orm";
import {
  addDays,
  type ClimateSegment,
  type ClimateSource,
  climateWindows,
  dateRange,
  periodDays,
  planWeatherFetches,
  toLocalDate,
  type WeatherNeed,
} from "@orchidiary/shared";
import { db, schema } from "../../db/client.ts";
import { env } from "../../env.ts";
import { fetchDaily } from "./openMeteo.ts";

const { placeLocations, plantLocations, plants, weatherDaily } = schema;

/** Limite de dias por requisição, para não pedir anos de uma vez. */
const MAX_DAYS_PER_REQUEST = 120;

export interface CollectResult {
  /** fontes de clima varridas: períodos de lugar + períodos de planta sem lugar */
  locations: number;
  /** coordenadas distintas consultadas */
  coordinates: number;
  requests: number;
  daysSaved: number;
  errors: Array<{ locationId: string; error: string }>;
}

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Coluna da fonte em `weather_daily`. */
const sourceColumn = (source: ClimateSource) => (source.kind === "place" ? weatherDaily.placeLocationId : weatherDaily.locationId);
const sourceValues = (source: ClimateSource) =>
  source.kind === "place" ? { placeLocationId: source.id, locationId: null } : { locationId: source.id, placeLocationId: null };

interface Site {
  source: ClimateSource;
  lat: number;
  lng: number;
  validFrom: Date;
  validTo: Date | null;
}

/**
 * Todas as fontes de clima: cada período de localização de cada LUGAR (mesmo sem planta
 * nenhuma ali — o lugar tem série própria) e cada período de planta viva sem lugar.
 */
async function sites(): Promise<Site[]> {
  const [placeRows, plantRows] = await Promise.all([
    db.select().from(placeLocations),
    db
      .select({ location: plantLocations })
      .from(plantLocations)
      .innerJoin(plants, eq(plants.id, plantLocations.plantId))
      .where(and(ne(plants.status, "dead"), isNull(plantLocations.placeId), isNotNull(plantLocations.lat))),
  ]);
  return [
    ...placeRows.map((p) => ({ source: { kind: "place" as const, id: p.id }, lat: p.lat, lng: p.lng, validFrom: p.validFrom, validTo: p.validTo })),
    ...plantRows.map(({ location }) => ({
      source: { kind: "plant" as const, id: location.id },
      lat: location.lat!,
      lng: location.lng!,
      validFrom: location.validFrom,
      validTo: location.validTo,
    })),
  ];
}

/**
 * Garante o clima diário de cada fonte, de todos os usuários.
 * Não depende do PC ter ficado ligado: calcula os dias que FALTAM no banco
 * e busca só esses (backfill). Pode rodar quantas vezes quiser — é idempotente.
 * Fontes na mesma coordenada (mesmo de usuários diferentes) dividem a mesma
 * requisição; o resultado é gravado em cada uma que precisa daquele dia.
 */
export async function collectWeather(now = new Date(), fetchImpl: typeof fetch = fetch): Promise<CollectResult> {
  const tz = env.APP_TIMEZONE;
  const today = toLocalDate(now, tz);
  const yesterday = addDays(today, -1);

  const all = await sites();
  const result: CollectResult = { locations: all.length, coordinates: 0, requests: 0, daysSaved: 0, errors: [] };

  const needs: WeatherNeed[] = [];
  const sourceOf = new Map<string, ClimateSource>();
  for (const site of all) {
    const span = periodDays(site, tz, yesterday);
    if (!span) continue;
    try {
      const existing = await db
        .select({ date: weatherDaily.date })
        .from(weatherDaily)
        .where(and(eq(sourceColumn(site.source), site.source.id), gte(weatherDaily.date, span.from), lte(weatherDaily.date, span.to)));
      const have = new Set(existing.map((e) => e.date));
      const missing = dateRange(span.from, span.to).filter((d) => !have.has(d));
      if (missing.length) {
        sourceOf.set(site.source.id, site.source);
        needs.push({ locationId: site.source.id, lat: site.lat, lng: site.lng, missing });
      }
    } catch (e) {
      result.errors.push({ locationId: site.source.id, error: errorMessage(e) });
    }
  }

  const plan = planWeatherFetches(needs, MAX_DAYS_PER_REQUEST);
  result.coordinates = new Set(plan.map((p) => p.key)).size;

  for (const req of plan) {
    try {
      result.requests++;
      const days = await fetchDaily({ lat: req.lat, lng: req.lng, from: req.from, to: req.to, timeZone: tz, today }, fetchImpl);
      const values = [...req.targets].flatMap(([id, wanted]) =>
        days.filter((d) => wanted.has(d.date)).map((d) => ({ ...d, ...sourceValues(sourceOf.get(id)!) })),
      );
      if (!values.length) continue;
      await db.insert(weatherDaily).values(values).onConflictDoNothing();
      result.daysSaved += values.length;
    } catch (e) {
      for (const id of req.targets.keys()) result.errors.push({ locationId: id, error: errorMessage(e) });
    }
  }
  return result;
}

/** Remove clima de dias que não pertencem mais ao período (ex.: mudança registrada depois da coleta). */
export async function pruneWeatherOutsidePeriods(locationIds: string[]): Promise<void> {
  if (!locationIds.length) return;
  const tz = env.APP_TIMEZONE;
  const locs = await db.select().from(plantLocations).where(inArray(plantLocations.id, locationIds));
  for (const loc of locs) {
    if (!loc.validTo) continue;
    const lastDay = addDays(toLocalDate(loc.validTo, tz), -1);
    await db.delete(weatherDaily).where(and(eq(weatherDaily.locationId, loc.id), gte(weatherDaily.date, addDays(lastDay, 1))));
  }
}

/**
 * Clima de uma planta ao longo do histórico dela: cada trecho traz os dias da fonte
 * que valia naquele momento (a série do lugar ou a dela mesma). Sem nada retroativo.
 */
export async function weatherOfSegments(segments: ClimateSegment[], from?: Date, to?: Date) {
  const tz = env.APP_TIMEZONE;
  const today = toLocalDate(new Date(), tz);
  const windows = climateWindows(segments, tz, from ? toLocalDate(from, tz) : "0000-01-01", to ? toLocalDate(to, tz) : today);
  if (!windows.length) return [];
  const rows = await Promise.all(
    windows.map(async (w) => {
      const found = await db
        .select()
        .from(weatherDaily)
        .where(and(eq(sourceColumn(w.source), w.source.id), gte(weatherDaily.date, w.from), lte(weatherDaily.date, w.to)));
      return found.map((d) => ({ ...d, sourceId: w.source.id }));
    }),
  );
  return rows.flat().sort((a, b) => a.date.localeCompare(b.date));
}
