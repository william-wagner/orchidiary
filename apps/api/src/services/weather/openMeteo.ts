import { addDays, aggregateHourly, type IsoDate } from "@orchidiary/shared";

/**
 * Cliente Open-Meteo (grátis, sem chave).
 * - Últimos ~3 meses: API de previsão (aceita start_date/end_date no passado).
 * - Mais antigo: API histórica (archive), útil para preencher lacunas e importar fotos antigas.
 * Umidade, ponto de orvalho e VPD são consolidados a partir dos dados horários.
 */
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive";
export const FORECAST_LOOKBACK_DAYS = 85;

const DAILY_VARS = [
  "temperature_2m_max",
  "temperature_2m_min",
  "temperature_2m_mean",
  "precipitation_sum",
  "shortwave_radiation_sum",
  "sunshine_duration",
  "et0_fao_evapotranspiration",
  "wind_speed_10m_max",
] as const;
const HOURLY_VARS = ["temperature_2m", "relative_humidity_2m", "dew_point_2m"] as const;

export interface DailyWeather {
  date: IsoDate;
  tempMin: number | null;
  tempMax: number | null;
  tempMean: number | null;
  humidityMean: number | null;
  humidityMin: number | null;
  humidityMax: number | null;
  dewPointMean: number | null;
  vpdMean: number | null;
  vpdMax: number | null;
  precipitation: number | null;
  radiation: number | null;
  sunshineHours: number | null;
  et0: number | null;
  windMax: number | null;
}

interface OpenMeteoResponse {
  daily?: Record<string, Array<number | string | null>> & { time: string[] };
  hourly?: Record<string, Array<number | string | null>> & { time: string[] };
}

export function buildUrl(p: { lat: number; lng: number; from: IsoDate; to: IsoDate; timeZone: string; today: IsoDate }): string {
  const useArchive = p.to < addDays(p.today, -FORECAST_LOOKBACK_DAYS);
  const url = new URL(useArchive ? ARCHIVE_URL : FORECAST_URL);
  url.searchParams.set("latitude", p.lat.toFixed(4));
  url.searchParams.set("longitude", p.lng.toFixed(4));
  url.searchParams.set("start_date", p.from);
  url.searchParams.set("end_date", p.to);
  url.searchParams.set("timezone", p.timeZone);
  url.searchParams.set("daily", DAILY_VARS.join(","));
  url.searchParams.set("hourly", HOURLY_VARS.join(","));
  return url.toString();
}

/**
 * Divide um intervalo em: parte antiga (archive) e parte recente (forecast).
 */
export function splitRange(from: IsoDate, to: IsoDate, today: IsoDate): Array<{ from: IsoDate; to: IsoDate }> {
  const cutoff = addDays(today, -FORECAST_LOOKBACK_DAYS);
  if (to < cutoff || from >= cutoff) return [{ from, to }];
  return [
    { from, to: addDays(cutoff, -1) },
    { from: cutoff, to },
  ];
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function parseResponse(json: OpenMeteoResponse): DailyWeather[] {
  const daily = json.daily;
  if (!daily?.time) return [];

  const hourlyByDay = new Map<string, Array<{ temperature: number | null; humidity: number | null; dewPoint: number | null }>>();
  const h = json.hourly;
  if (h?.time) {
    h.time.forEach((t, i) => {
      const day = t.slice(0, 10);
      const list = hourlyByDay.get(day) ?? [];
      list.push({
        temperature: num(h.temperature_2m?.[i]),
        humidity: num(h.relative_humidity_2m?.[i]),
        dewPoint: num(h.dew_point_2m?.[i]),
      });
      hourlyByDay.set(day, list);
    });
  }

  return daily.time.map((date, i) => {
    const sunshine = num(daily.sunshine_duration?.[i]);
    return {
      date,
      tempMin: num(daily.temperature_2m_min?.[i]),
      tempMax: num(daily.temperature_2m_max?.[i]),
      tempMean: num(daily.temperature_2m_mean?.[i]),
      precipitation: num(daily.precipitation_sum?.[i]),
      radiation: num(daily.shortwave_radiation_sum?.[i]),
      sunshineHours: sunshine == null ? null : Math.round((sunshine / 3600) * 10) / 10,
      et0: num(daily.et0_fao_evapotranspiration?.[i]),
      windMax: num(daily.wind_speed_10m_max?.[i]),
      ...aggregateHourly(hourlyByDay.get(date) ?? []),
    };
  });
}

/** Dias ainda sem dado (a API às vezes devolve null nos últimos dias do archive). */
export const isComplete = (d: DailyWeather) => d.tempMin != null && d.tempMax != null;

export async function fetchDaily(
  p: { lat: number; lng: number; from: IsoDate; to: IsoDate; timeZone: string; today: IsoDate },
  fetchImpl: typeof fetch = fetch,
): Promise<DailyWeather[]> {
  const out: DailyWeather[] = [];
  for (const part of splitRange(p.from, p.to, p.today)) {
    const res = await fetchImpl(buildUrl({ ...p, ...part }), { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`Open-Meteo respondeu ${res.status}: ${await res.text()}`);
    out.push(...parseResponse((await res.json()) as OpenMeteoResponse).filter(isComplete));
  }
  return out;
}
