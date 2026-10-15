import { test } from "node:test";
import assert from "node:assert/strict";
import { buildUrl, fetchDaily, parseResponse, splitRange } from "./openMeteo.ts";

const hours = (day: string, temps: number[], rh: number[], dew: number[]) => ({
  time: temps.map((_, i) => `${day}T${String(i).padStart(2, "0")}:00`),
  temperature_2m: temps,
  relative_humidity_2m: rh,
  dew_point_2m: dew,
});

const fixture = {
  daily: {
    time: ["2026-10-13", "2026-10-14"],
    temperature_2m_max: [29.1, 31.4],
    temperature_2m_min: [16.2, 17.0],
    temperature_2m_mean: [22.0, 23.5],
    precipitation_sum: [0, 12.4],
    shortwave_radiation_sum: [21.3, 14.8],
    sunshine_duration: [36000, 18000],
    et0_fao_evapotranspiration: [4.1, 3.2],
    wind_speed_10m_max: [11.2, 18.9],
  },
  hourly: (() => {
    const a = hours("2026-10-13", [18, 28], [85, 45], [15.5, 15.2]);
    const b = hours("2026-10-14", [19, 30], [90, 55], [17.3, 20.0]);
    return {
      time: [...a.time, ...b.time],
      temperature_2m: [...a.temperature_2m, ...b.temperature_2m],
      relative_humidity_2m: [...a.relative_humidity_2m, ...b.relative_humidity_2m],
      dew_point_2m: [...a.dew_point_2m, ...b.dew_point_2m],
    };
  })(),
};

test("parseResponse junta diário e horário por dia", () => {
  const [d1, d2] = parseResponse(fixture);
  assert.equal(d1!.date, "2026-10-13");
  assert.equal(d1!.tempMax, 29.1);
  assert.equal(d1!.sunshineHours, 10);
  assert.equal(d1!.humidityMean, 65);
  assert.equal(d1!.humidityMin, 45);
  assert.equal(d2!.precipitation, 12.4);
  assert.equal(d2!.humidityMax, 90);
  assert.ok(d2!.vpdMax! > 1.5);
});

test("intervalos antigos vão para a API histórica e os recentes para a de previsão", () => {
  const today = "2026-10-15";
  assert.deepEqual(splitRange("2026-10-01", "2026-10-14", today), [{ from: "2026-10-01", to: "2026-10-14" }]);
  const parts = splitRange("2026-01-01", "2026-10-14", today);
  assert.equal(parts.length, 2);
  assert.equal(parts[0]!.to < parts[1]!.from, true);

  const tz = "America/Sao_Paulo";
  const old = buildUrl({ lat: -19.9, lng: -43.9, from: "2025-01-01", to: "2025-01-31", timeZone: tz, today });
  assert.ok(old.startsWith("https://archive-api.open-meteo.com/v1/archive?"));
  const recent = buildUrl({ lat: -19.9, lng: -43.9, from: "2026-10-14", to: "2026-10-14", timeZone: tz, today });
  assert.ok(recent.startsWith("https://api.open-meteo.com/v1/forecast?"));
  assert.ok(recent.includes("timezone=America%2FSao_Paulo"));
});

test("fetchDaily descarta dias ainda sem dado e propaga erro HTTP", async () => {
  const withGap = structuredClone(fixture);
  (withGap.daily.temperature_2m_min as Array<number | null>)[1] = null;
  const ok = (async () => new Response(JSON.stringify(withGap))) as unknown as typeof fetch;
  const days = await fetchDaily(
    { lat: -19.9, lng: -43.9, from: "2026-10-13", to: "2026-10-14", timeZone: "America/Sao_Paulo", today: "2026-10-15" },
    ok,
  );
  assert.deepEqual(days.map((d) => d.date), ["2026-10-13"]);

  const fail = (async () => new Response("limite", { status: 429 })) as unknown as typeof fetch;
  await assert.rejects(
    fetchDaily({ lat: 0, lng: 0, from: "2026-10-13", to: "2026-10-14", timeZone: "UTC", today: "2026-10-15" }, fail),
    /429/,
  );
});
