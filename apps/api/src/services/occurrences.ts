import { and, eq, gte, lt, type SQL } from "drizzle-orm";
import { addDays, buildOccurrences, formatLocality, type IsoDate, startOfLocalDay } from "@orchidiary/shared";
import { db, schema } from "../db/client.ts";
import { env } from "../env.ts";
import { listLocations } from "./locations.ts";
import { readingsForPlant } from "./readings.ts";

const { events, photos } = schema;

/**
 * Fita de ocorrências e feed da folha expandida, numa chamada só: fotos, eventos (menos os
 * de lote) e medições manuais entre os dias locais `from` e `to`, inclusive, em ordem crescente.
 * Cada item leva o local onde a planta estava naquela data.
 */
export async function plantOccurrences(plantId: string, from?: IsoDate, to?: IsoDate) {
  const tz = env.APP_TIMEZONE;
  const start = from ? startOfLocalDay(from, tz) : undefined;
  const end = to ? startOfLocalDay(addDays(to, 1), tz) : undefined;
  const range = <C extends typeof photos.takenAt | typeof events.occurredAt>(col: C) => {
    const out: SQL[] = [];
    if (start) out.push(gte(col, start));
    if (end) out.push(lt(col, end));
    return out;
  };

  const periods = await listLocations(plantId);
  const [photoRows, eventRows, readings] = await Promise.all([
    db
      .select({ id: photos.id, takenAt: photos.takenAt, caption: photos.caption, width: photos.width, height: photos.height })
      .from(photos)
      .where(and(eq(photos.plantId, plantId), ...range(photos.takenAt))),
    db
      .select({
        id: events.id,
        occurredAt: events.occurredAt,
        type: events.type,
        notes: events.notes,
        data: events.data,
        batchId: events.batchId,
      })
      .from(events)
      .where(and(eq(events.plantId, plantId), ...range(events.occurredAt))),
    readingsForPlant(plantId, periods, start, end),
  ]);

  return buildOccurrences({
    photos: photoRows,
    events: eventRows,
    readings,
    // planta sem lugar: o rótulo é a cidade da localização própria
    periods: periods.map((p) => ({ ...p, label: p.placeName ?? formatLocality(p) })),
  });
}
