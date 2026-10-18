import { and, eq, gte, inArray, lte, ne } from "drizzle-orm";
import { addDays, dateRange, periodDays, planWeatherFetches, toLocalDate, type WeatherNeed } from "@orchidiary/shared";
import { db, schema } from "../../db/client.ts";
import { env } from "../../env.ts";
import { fetchDaily } from "./openMeteo.ts";

const { plantLocations, plants, weatherDaily } = schema;

/** Limite de dias por requisição, para não pedir anos de uma vez. */
const MAX_DAYS_PER_REQUEST = 120;

export interface CollectResult {
  locations: number;
  /** coordenadas distintas consultadas */
  coordinates: number;
  requests: number;
  daysSaved: number;
  errors: Array<{ locationId: string; error: string }>;
}

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Garante o clima diário de cada período de local de cada planta ativa, de todos os usuários.
 * Não depende do PC ter ficado ligado: calcula os dias que FALTAM no banco
 * e busca só esses (backfill). Pode rodar quantas vezes quiser — é idempotente.
 * Períodos na mesma coordenada (mesmo de usuários diferentes) dividem a mesma
 * requisição; o resultado é gravado em cada período que precisa daquele dia.
 */
export async function collectWeather(now = new Date(), fetchImpl: typeof fetch = fetch): Promise<CollectResult> {
  const tz = env.APP_TIMEZONE;
  const today = toLocalDate(now, tz);
  const yesterday = addDays(today, -1);

  const rows = await db
    .select({ location: plantLocations })
    .from(plantLocations)
    .innerJoin(plants, eq(plants.id, plantLocations.plantId))
    .where(ne(plants.status, "dead"));

  const result: CollectResult = { locations: rows.length, coordinates: 0, requests: 0, daysSaved: 0, errors: [] };

  const needs: WeatherNeed[] = [];
  for (const { location } of rows) {
    const span = periodDays(location, tz, yesterday);
    if (!span) continue;
    try {
      const existing = await db
        .select({ date: weatherDaily.date })
        .from(weatherDaily)
        .where(and(eq(weatherDaily.locationId, location.id), gte(weatherDaily.date, span.from), lte(weatherDaily.date, span.to)));
      const have = new Set(existing.map((e) => e.date));
      const missing = dateRange(span.from, span.to).filter((d) => !have.has(d));
      if (missing.length) needs.push({ locationId: location.id, lat: location.lat, lng: location.lng, missing });
    } catch (e) {
      result.errors.push({ locationId: location.id, error: errorMessage(e) });
    }
  }

  const plan = planWeatherFetches(needs, MAX_DAYS_PER_REQUEST);
  result.coordinates = new Set(plan.map((p) => p.key)).size;

  for (const req of plan) {
    try {
      result.requests++;
      const days = await fetchDaily({ lat: req.lat, lng: req.lng, from: req.from, to: req.to, timeZone: tz, today }, fetchImpl);
      const values = [...req.targets].flatMap(([locationId, wanted]) =>
        days.filter((d) => wanted.has(d.date)).map((d) => ({ ...d, locationId })),
      );
      if (!values.length) continue;
      await db.insert(weatherDaily).values(values).onConflictDoNothing();
      result.daysSaved += values.length;
    } catch (e) {
      for (const locationId of req.targets.keys()) result.errors.push({ locationId, error: errorMessage(e) });
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
