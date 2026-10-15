import { and, eq, gte, inArray, lte, ne } from "drizzle-orm";
import { addDays, dateRange, periodDays, toContiguousRanges, toLocalDate } from "@orchidiary/shared";
import { db, schema } from "../../db/client.ts";
import { env } from "../../env.ts";
import { fetchDaily } from "./openMeteo.ts";

const { plantLocations, plants, weatherDaily } = schema;

/** Limite de dias por requisição, para não pedir anos de uma vez. */
const MAX_DAYS_PER_REQUEST = 120;

export interface CollectResult {
  locations: number;
  daysSaved: number;
  errors: Array<{ locationId: string; error: string }>;
}

/**
 * Garante o clima diário de cada período de local de cada planta ativa.
 * Não depende do PC ter ficado ligado: calcula os dias que FALTAM no banco
 * e busca só esses (backfill). Pode rodar quantas vezes quiser — é idempotente.
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

  const result: CollectResult = { locations: rows.length, daysSaved: 0, errors: [] };

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

      for (const range of toContiguousRanges(missing)) {
        for (let from = range.from; from <= range.to; from = addDays(from, MAX_DAYS_PER_REQUEST)) {
          const chunkTo = addDays(from, MAX_DAYS_PER_REQUEST - 1);
          const to = chunkTo < range.to ? chunkTo : range.to;
          const days = await fetchDaily({ lat: location.lat, lng: location.lng, from, to, timeZone: tz, today }, fetchImpl);
          if (!days.length) continue;
          await db
            .insert(weatherDaily)
            .values(days.map((d) => ({ ...d, locationId: location.id })))
            .onConflictDoNothing();
          result.daysSaved += days.length;
        }
      }
    } catch (e) {
      result.errors.push({ locationId: location.id, error: e instanceof Error ? e.message : String(e) });
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
