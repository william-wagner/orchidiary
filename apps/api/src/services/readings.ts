import { and, eq, gte, inArray, lt, type SQL } from "drizzle-orm";
import { placeReadingsForPlant } from "@orchidiary/shared";
import { db, schema } from "../db/client.ts";
import type { ResolvedPeriod } from "./locations.ts";

const { manualReadings } = schema;
type Reading = typeof manualReadings.$inferSelect;

/**
 * Medições manuais que valem para a planta no intervalo [from, to): as dela e as dos lugares
 * por onde passou, só as feitas enquanto ela estava lá. Em ordem crescente.
 */
export async function readingsForPlant(plantId: string, periods: ResolvedPeriod[], from?: Date, to?: Date) {
  const placeIds = [...new Set(periods.map((p) => p.placeId).filter((id): id is string => !!id))];
  const range: SQL[] = [];
  if (from) range.push(gte(manualReadings.measuredAt, from));
  if (to) range.push(lt(manualReadings.measuredAt, to));
  const [own, ofPlaces] = await Promise.all([
    db
      .select()
      .from(manualReadings)
      .where(and(eq(manualReadings.plantId, plantId), ...range)),
    placeIds.length
      ? db
          .select()
          .from(manualReadings)
          .where(and(inArray(manualReadings.placeId, placeIds), ...range))
      : Promise.resolve([] as Reading[]),
  ]);
  const fromPlaces = placeReadingsForPlant(
    ofPlaces.filter((r): r is Reading & { placeId: string } => r.placeId !== null),
    periods,
  );
  return [...own, ...fromPlaces].sort((a, b) => a.measuredAt.getTime() - b.measuredAt.getTime());
}
