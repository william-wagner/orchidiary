import { and, eq, isNotNull, isNull, ne } from "drizzle-orm";
import { addDays, toLocalDate } from "@orchidiary/shared";
import { db, schema } from "../db/client.ts";
import { env } from "../env.ts";
import { sourceLogger } from "../logger.ts";
import { sendAlert } from "./telegram.ts";
import { evaluateForecast, type ForecastDay } from "./alertRules.ts";
import { effectiveCareOf } from "./taxonomy.ts";

async function fetchTomorrow(lat: number, lng: number, tomorrow: string, fetchImpl: typeof fetch): Promise<ForecastDay | null> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", lat.toFixed(4));
  url.searchParams.set("longitude", lng.toFixed(4));
  url.searchParams.set("daily", "temperature_2m_min,temperature_2m_max");
  url.searchParams.set("timezone", env.APP_TIMEZONE);
  url.searchParams.set("start_date", tomorrow);
  url.searchParams.set("end_date", tomorrow);
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  const json = (await res.json()) as { daily?: { temperature_2m_min?: number[]; temperature_2m_max?: number[] } };
  return {
    date: tomorrow,
    tempMin: json.daily?.temperature_2m_min?.[0] ?? null,
    tempMax: json.daily?.temperature_2m_max?.[0] ?? null,
  };
}

/** Roda após a coleta diária: alerta de frio/calor previsto para amanhã. */
export async function runForecastAlerts(now = new Date(), fetchImpl: typeof fetch = fetch) {
  const tomorrow = addDays(toLocalDate(now, env.APP_TIMEZONE), 1);
  const rows = await db
    .select({ plant: schema.plants, location: schema.plantLocations })
    .from(schema.plants)
    .innerJoin(
      schema.plantLocations,
      and(eq(schema.plantLocations.plantId, schema.plants.id), isNull(schema.plantLocations.validTo)),
    )
    .where(
      and(
        isNotNull(schema.plants.taxonId),
        ne(schema.plants.status, "dead"),
        ne(schema.plants.status, "given_away"),
        eq(schema.plantLocations.environment, "outdoor"),
      ),
    );
  // faixas herdadas: uma Vanda coerulea sem faixa própria usa a do gênero Vanda
  const careBy = await effectiveCareOf(rows.map((r) => r.plant.taxonId!));

  let sent = 0;
  for (const { plant, location } of rows) {
    const care = careBy.get(plant.taxonId!)?.care;
    if (!care || (care.tempNightMin == null && care.tempDayMax == null)) continue;
    try {
      const day = await fetchTomorrow(location.lat, location.lng, tomorrow, fetchImpl);
      if (!day) continue;
      for (const draft of evaluateForecast(plant.nickname, care, day)) {
        const r = await sendAlert({
          userId: plant.userId,
          plantId: plant.id,
          kind: draft.kind,
          message: draft.message,
          dedupeKey: `${draft.kind}:${plant.id}:${draft.date}`,
        });
        if (r === "sent") sent++;
      }
    } catch (e) {
      sourceLogger("scheduler:alertas").error({ err: e, plantId: plant.id }, "falha ao avaliar a previsão da planta");
    }
  }
  return { checked: rows.length, sent };
}
