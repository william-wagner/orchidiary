import { and, eq, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { addDays, coordKey, toLocalDate } from "@orchidiary/shared";
import { db, schema } from "../db/client.ts";
import { env } from "../env.ts";
import { http } from "../http/clients.ts";
import type { HttpClient } from "../http/client.ts";
import { sourceLogger } from "../logger.ts";
import { sendAlert } from "./telegram.ts";
import { evaluateForecast, type ForecastDay } from "./alertRules.ts";
import { effectiveCareOf } from "./taxonomy.ts";

async function fetchTomorrow(lat: number, lng: number, tomorrow: string, client: HttpClient): Promise<ForecastDay | null> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", lat.toFixed(4));
  url.searchParams.set("longitude", lng.toFixed(4));
  url.searchParams.set("daily", "temperature_2m_min,temperature_2m_max");
  url.searchParams.set("timezone", env.APP_TIMEZONE);
  url.searchParams.set("start_date", tomorrow);
  url.searchParams.set("end_date", tomorrow);
  return client.call({ operation: "forecast.alert", url, init: { signal: AbortSignal.timeout(20_000) }, meta: { date: tomorrow } }, async (res) => {
    if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
    const json = (await res.json()) as { daily?: { temperature_2m_min?: number[]; temperature_2m_max?: number[] } };
    return {
      date: tomorrow,
      tempMin: json.daily?.temperature_2m_min?.[0] ?? null,
      tempMax: json.daily?.temperature_2m_max?.[0] ?? null,
    };
  });
}

/** Roda após a coleta diária: alerta de frio/calor previsto para amanhã. */
export async function runForecastAlerts(now = new Date(), client: HttpClient = http.openMeteo) {
  const tomorrow = addDays(toLocalDate(now, env.APP_TIMEZONE), 1);
  // Coordenada e ambiente vêm do lugar quando a planta está num; sem lugar, são dela.
  const rows = await db
    .select({
      plant: schema.plants,
      location: {
        lat: sql<number>`coalesce(${schema.placeLocations.lat}, ${schema.plantLocations.lat})`,
        lng: sql<number>`coalesce(${schema.placeLocations.lng}, ${schema.plantLocations.lng})`,
      },
    })
    .from(schema.plants)
    .innerJoin(
      schema.plantLocations,
      and(eq(schema.plantLocations.plantId, schema.plants.id), isNull(schema.plantLocations.validTo)),
    )
    .leftJoin(schema.places, eq(schema.places.id, schema.plantLocations.placeId))
    .leftJoin(
      schema.placeLocations,
      and(eq(schema.placeLocations.placeId, schema.places.id), isNull(schema.placeLocations.validTo)),
    )
    .where(
      and(
        isNotNull(schema.plants.taxonId),
        ne(schema.plants.status, "dead"),
        ne(schema.plants.status, "given_away"),
        eq(sql`coalesce(${schema.places.environment}, ${schema.plantLocations.environment})`, "outdoor"),
      ),
    );
  // faixas herdadas: uma Vanda coerulea sem faixa própria usa a do gênero Vanda
  const careBy = await effectiveCareOf(rows.map((r) => r.plant.taxonId!));

  // Uma previsão por coordenada, compartilhada entre plantas (e usuários) no mesmo ponto
  const forecasts = new Map<string, Promise<ForecastDay | null>>();
  const forecastAt = (lat: number, lng: number) => {
    const key = coordKey({ lat, lng });
    let p = forecasts.get(key);
    if (!p) forecasts.set(key, (p = fetchTomorrow(lat, lng, tomorrow, client)));
    return p;
  };

  let sent = 0;
  for (const { plant, location } of rows) {
    const care = careBy.get(plant.taxonId!)?.care;
    if (!care || (care.tempNightMin == null && care.tempDayMax == null)) continue;
    try {
      const day = await forecastAt(location.lat, location.lng);
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
  return { checked: rows.length, requests: forecasts.size, sent };
}
