import { test } from "node:test";
import assert from "node:assert/strict";
import {
  attentionOf,
  classifyComfort,
  comfortChanges,
  comfortDays,
  comfortFlags,
  comfortRanges,
  type ComfortWeatherDay,
  digestBoundary,
  digestWindows,
} from "./comfort.ts";
import { addDays, dateRange } from "./dates.ts";

const vanda = comfortRanges({ tempNightMin: 15, tempNightMax: 22, tempDayMin: 24, tempDayMax: 32, humidityMin: 60, humidityMax: 85 });

/** Clima de exemplo: um dia por data, com a mínima vinda de `mins` e o resto ameno. */
function weather(from: string, mins: number[]): ComfortWeatherDay[] {
  return mins.map((tempMin, i) => ({ date: addDays(from, i), tempMin, tempMax: 28, humidityMean: 70 }));
}

test("conforto: dentro, perto (até a margem) e fora, nos dois sentidos", () => {
  const r = { min: 15, max: 22 };
  assert.deepEqual(classifyComfort(18, r, 1.5), { state: "inside", direction: 0, diff: 0 });
  assert.deepEqual(classifyComfort(13.5, r, 1.5), { state: "near", direction: -1, diff: 1.5 });
  assert.deepEqual(classifyComfort(13.4, r, 1.5), { state: "outside", direction: -1, diff: 1.6 });
  assert.deepEqual(classifyComfort(24, r, 1.5), { state: "outside", direction: 1, diff: 2 });
});

test("conforto: faixa com um limite só e ficha sem faixa", () => {
  assert.equal(classifyComfort(40, { min: 10, max: null }, 1.5).state, "inside");
  assert.equal(classifyComfort(5, { min: 10, max: null }, 1.5).state, "outside");
  const r = comfortRanges({ tempNightMin: null, tempNightMax: null, tempDayMin: null, tempDayMax: 30, humidityMin: null, humidityMax: null });
  assert.equal(r.night, null);
  assert.deepEqual(r.day, { min: null, max: 30 });
});

test("conforto: dia sem clima fica sem estado e não conta", () => {
  const days = comfortDays("night", vanda.night!, weather("2026-10-01", [10]), "2026-09-30", "2026-10-01");
  assert.equal(days[0]!.value, null);
  assert.equal(days[0]!.state, null);
  assert.equal(days[1]!.state, "outside");
  assert.deepEqual(attentionOf(days), { direction: 0, count: 1, total: 1 });
});

test("conforto: atenção pede 3 dias fora no mesmo sentido", () => {
  const two = comfortDays("night", vanda.night!, weather("2026-10-01", [10, 10, 25, 18]), "2026-10-01", "2026-10-04");
  assert.equal(attentionOf(two).direction, 0, "2 frias e 1 quente não somam");
  const three = comfortDays("night", vanda.night!, weather("2026-10-01", [10, 10, 11, 18]), "2026-10-01", "2026-10-04");
  assert.deepEqual(attentionOf(three), { direction: -1, count: 3, total: 4 });
});

test("selo do card: olha só os últimos 7 dias e respeita o silêncio", () => {
  // frio só na semana anterior: nada no card
  const old = weather("2026-10-06", [10, 10, 10, 10, 18, 18, 18, 18, 18, 18, 18, 18]);
  assert.deepEqual(comfortFlags(vanda, old, "2026-10-17"), []);
  const cold = weather("2026-10-11", [18, 18, 18, 18, 11, 12, 10]);
  assert.deepEqual(comfortFlags(vanda, cold, "2026-10-17"), [{ dimension: "night", direction: -1, label: "noites frias", count: 3 }]);
  assert.deepEqual(comfortFlags(vanda, cold, "2026-10-17", new Set(["night"])), []);
});

test("selo do card: a pior dimensão primeiro", () => {
  const w = dateRange("2026-10-11", "2026-10-17").map((date, i) => ({ date, tempMin: i < 3 ? 10 : 18, tempMax: 35, humidityMean: 70 }));
  assert.deepEqual(
    comfortFlags(vanda, w, "2026-10-17").map((f) => f.label),
    ["dias quentes", "noites frias"],
  );
});

test("resumo: a quinzena fecha a cada 14 dias a partir da âncora", () => {
  assert.equal(digestBoundary("2026-01-05"), "2026-01-05");
  assert.equal(digestBoundary("2026-01-18"), "2026-01-05");
  assert.equal(digestBoundary("2026-01-19"), "2026-01-19");
  assert.equal(digestBoundary("2025-12-30"), "2025-12-22", "antes da âncora também funciona");
  assert.deepEqual(digestWindows("2026-10-19"), {
    current: { from: "2026-10-05", to: "2026-10-18" },
    previous: { from: "2026-09-21", to: "2026-10-04" },
  });
});

test("resumo: avisa quem entrou e quem saiu; quem continua igual fica quieto", () => {
  const boundary = "2026-10-19";
  const prev = Array(14).fill(18);
  const curCold = [18, 18, 18, 18, 18, 18, 18, 18, 18, 18, 11, 11, 11, 11];
  const entered = comfortChanges(vanda, weather("2026-09-21", [...prev, ...curCold]), boundary);
  assert.equal(entered.length, 1);
  assert.equal(entered[0]!.kind, "entered");
  assert.equal(entered[0]!.label, "noites frias");
  assert.equal(entered[0]!.current.count, 4);
  assert.equal(entered[0]!.previous.count, 0);

  const left = comfortChanges(vanda, weather("2026-09-21", [...curCold, ...prev]), boundary);
  assert.equal(left[0]!.kind, "left");
  assert.equal(left[0]!.previous.count, 4);

  assert.deepEqual(comfortChanges(vanda, weather("2026-09-21", [...curCold, ...curCold]), boundary), [], "continua frio: não repete");
  assert.deepEqual(comfortChanges(vanda, weather("2026-09-21", [...prev, ...curCold]), boundary, new Set(["night"])), []);
});

test("resumo: virar de frio para calor conta como mudança", () => {
  const cold = Array(14).fill(10);
  const hot = Array(14).fill(26);
  const c = comfortChanges(vanda, weather("2026-09-21", [...cold, ...hot]), "2026-10-19");
  assert.equal(c.length, 1);
  assert.equal(c[0]!.label, "noites quentes");
});
