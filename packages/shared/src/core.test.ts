import { test } from "node:test";
import assert from "node:assert/strict";
import { checkPhotoLocation, distanceMeters } from "./geo.ts";
import { addDays, dateRange, formatAccession, herbariumDate, toContiguousRanges, toLocalDate } from "./dates.ts";
import { periodAt, periodDays, planMove, RetroactiveMoveError, type LocationPeriod } from "./locations.ts";
import { aggregateHourly, vpd } from "./climate.ts";

const BH = { lat: -19.9167, lng: -43.9345 }; // Belo Horizonte
const SP = { lat: -23.5505, lng: -46.6333 }; // São Paulo

test("distância BH–SP fica perto de 490 km", () => {
  const km = distanceMeters(BH, SP) / 1000;
  assert.ok(km > 480 && km < 500, `obtido ${km}`);
});

test("foto no mesmo endereço não dispara alerta; em outra cidade dispara", () => {
  const near = { lat: BH.lat + 0.0005, lng: BH.lng }; // ~55 m
  assert.equal(checkPhotoLocation(BH, near, 300).mismatch, false);
  assert.equal(checkPhotoLocation(BH, SP, 300).mismatch, true);
});

test("precisão ruim do GPS amplia a tolerância", () => {
  const p = { lat: BH.lat + 0.004, lng: BH.lng, accuracyMeters: 500 }; // ~445 m
  assert.equal(checkPhotoLocation(BH, p, 300).mismatch, false);
});

test("datas locais respeitam o fuso de São Paulo", () => {
  // 02:00 UTC do dia 16 ainda é dia 15 em São Paulo (UTC-3)
  assert.equal(toLocalDate(new Date("2026-10-16T02:00:00Z"), "America/Sao_Paulo"), "2026-10-15");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.deepEqual(dateRange("2026-02-27", "2026-03-01"), ["2026-02-27", "2026-02-28", "2026-03-01"]);
  assert.deepEqual(toContiguousRanges(["2026-01-03", "2026-01-01", "2026-01-02", "2026-01-05"]), [
    { from: "2026-01-01", to: "2026-01-03" },
    { from: "2026-01-05", to: "2026-01-05" },
  ]);
});

const periods: LocationPeriod[] = [
  { id: "bh", validFrom: new Date("2026-01-10T12:00:00Z"), validTo: new Date("2026-06-01T15:00:00Z") },
  { id: "sp", validFrom: new Date("2026-06-01T15:00:00Z"), validTo: null },
];

test("periodAt devolve onde a planta estava em cada momento", () => {
  assert.equal(periodAt(periods, new Date("2026-03-01T00:00:00Z"))?.id, "bh");
  assert.equal(periodAt(periods, new Date("2026-06-01T15:00:00Z"))?.id, "sp");
  assert.equal(periodAt(periods, new Date("2025-12-01T00:00:00Z")), undefined);
});

test("mudança não pode ser retroativa nem futura", () => {
  const now = new Date("2026-10-15T12:00:00Z");
  assert.throws(() => planMove(periods, new Date("2026-05-01T00:00:00Z"), now), RetroactiveMoveError);
  assert.throws(() => planMove(periods, new Date("2026-06-01T15:00:00Z"), now), RetroactiveMoveError);
  assert.throws(() => planMove(periods, new Date("2026-11-01T00:00:00Z"), now), RetroactiveMoveError);
  const plan = planMove(periods, new Date("2026-10-01T00:00:00Z"), now);
  assert.equal(plan.close?.id, "sp");
});

test("o dia da mudança pertence ao local novo", () => {
  const tz = "America/Sao_Paulo";
  assert.deepEqual(periodDays(periods[0]!, tz, "2026-10-14"), { from: "2026-01-10", to: "2026-05-31" });
  assert.deepEqual(periodDays(periods[1]!, tz, "2026-10-14"), { from: "2026-06-01", to: "2026-10-14" });
  // período aberto e fechado no mesmo dia não cobre nenhum dia
  const sameDay = { id: "x", validFrom: new Date("2026-06-01T12:00:00Z"), validTo: new Date("2026-06-01T18:00:00Z") };
  assert.equal(periodDays(sameDay, tz, "2026-10-14"), null);
});

test("VPD e agregação horária", () => {
  assert.ok(Math.abs(vpd(25, 60) - 1.27) < 0.01);
  const daily = aggregateHourly([
    { temperature: 20, humidity: 80, dewPoint: 16.4 },
    { temperature: 30, humidity: 40, dewPoint: 14.9 },
    { temperature: null, humidity: 70, dewPoint: null },
  ]);
  assert.equal(daily.humidityMin, 40);
  assert.equal(daily.humidityMax, 80);
  assert.equal(daily.humidityMean, 63.3);
  assert.equal(daily.dewPointMean, 15.7);
  assert.ok(daily.vpdMax! > daily.vpdMean!);
});

test("data de herbário e número de tombo", () => {
  assert.equal(herbariumDate("2026-10-14", "America/Sao_Paulo"), "14.X.2026");
  // 01:30 UTC do dia 1º de março ainda é 28 de fevereiro em São Paulo
  assert.equal(herbariumDate(new Date("2026-03-01T01:30:00Z"), "America/Sao_Paulo"), "28.II.2026");
  assert.equal(herbariumDate("2026-12-01T15:00:00.000Z", "America/Sao_Paulo"), "1.XII.2026");
  assert.equal(formatAccession(7), "0007");
  assert.equal(formatAccession(12345), "12345");
  assert.equal(formatAccession(null), "s/n");
});
