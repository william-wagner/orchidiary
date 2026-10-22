import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildOccurrences,
  CHART_DEFAULT_WINDOW,
  chartRange,
  EVENT_LAYER,
  isWeeklyChart,
  parseChartWindow,
  readingPanel,
  weeklySeries,
  weekStart,
} from "./chart.ts";
import { localHour, startOfLocalDay } from "./dates.ts";
import { EVENT_TYPES } from "./enums.ts";

const TZ = "America/Sao_Paulo";

test("janela: padrão sem parâmetro, valores da lista, 'all' e recusa do resto", () => {
  assert.equal(parseChartWindow(undefined), CHART_DEFAULT_WINDOW);
  assert.equal(parseChartWindow(""), CHART_DEFAULT_WINDOW);
  assert.equal(parseChartWindow("30"), 30);
  assert.equal(parseChartWindow("360"), 360);
  assert.equal(parseChartWindow("all"), "all");
  assert.equal(parseChartWindow("45"), null);
  assert.equal(parseChartWindow("tudo"), null);
});

test("janela: dias fixos contam até o fim; 'tudo' começa na planta e nunca depois do fim", () => {
  assert.deepEqual(chartRange(30, "2026-10-21", "2026-10-01"), { from: "2026-09-22", to: "2026-10-21" });
  assert.deepEqual(chartRange("all", "2026-10-21", "2025-10-24"), { from: "2025-10-24", to: "2026-10-21" });
  // planta cadastrada hoje: o fim (ontem) vem antes do começo
  assert.deepEqual(chartRange("all", "2026-10-21", "2026-10-22"), { from: "2026-10-21", to: "2026-10-21" });
  assert.deepEqual(chartRange("all", "2026-10-21", null), { from: "2026-10-21", to: "2026-10-21" });
});

test("janela: agrega por semana só acima de 120 dias", () => {
  assert.equal(isWeeklyChart("2026-06-24", "2026-10-21"), false); // 120 dias
  assert.equal(isWeeklyChart("2026-06-23", "2026-10-21"), true); // 121
});

test("semana: de segunda a domingo, mínima mais baixa, máxima mais alta, umidade média", () => {
  assert.equal(weekStart("2026-10-19"), "2026-10-19"); // segunda
  assert.equal(weekStart("2026-10-25"), "2026-10-19"); // domingo
  const weeks = weeklySeries([
    { date: "2026-10-18", tempMin: 15, tempMax: 25, humidityMean: 80 }, // domingo: semana anterior
    { date: "2026-10-19", tempMin: 14, tempMax: 26, humidityMean: 60 },
    { date: "2026-10-20", tempMin: 12.5, tempMax: 29, humidityMean: 71 },
    { date: "2026-10-21", tempMin: null, tempMax: null, humidityMean: null },
  ]);
  assert.deepEqual(weeks, [
    { date: "2026-10-12", to: "2026-10-18", tempMin: 15, tempMax: 25, humidityMean: 80 },
    { date: "2026-10-19", to: "2026-10-25", tempMin: 12.5, tempMax: 29, humidityMean: 65.5 },
  ]);
  // semana sem nenhum dado não aparece
  assert.deepEqual(weeklySeries([{ date: "2026-10-19", tempMin: null, tempMax: null, humidityMean: null }]), []);
});

test("fita: todo tipo de evento tem camada; manejo e notas separados dos marcos", () => {
  for (const t of EVENT_TYPES) assert.ok(EVENT_LAYER[t], t);
  assert.equal(EVENT_LAYER.watering, "care");
  assert.equal(EVENT_LAYER.note, "notes");
  assert.equal(EVENT_LAYER.moved, "milestones");
  assert.equal(EVENT_LAYER.pest, "health");
});

test("medição: 19h às 8h vai para as noites; o resto, para os dias (hora local)", () => {
  assert.equal(readingPanel(new Date("2026-07-10T21:59:00-03:00"), TZ), "night");
  assert.equal(readingPanel(new Date("2026-07-10T19:00:00-03:00"), TZ), "night");
  assert.equal(readingPanel(new Date("2026-07-10T18:59:00-03:00"), TZ), "day");
  assert.equal(readingPanel(new Date("2026-07-10T07:59:00-03:00"), TZ), "night");
  assert.equal(readingPanel(new Date("2026-07-10T08:00:00-03:00"), TZ), "day");
  assert.equal(localHour(new Date("2026-07-10T00:30:00-03:00"), TZ), 0);
});

test("início do dia local respeita o fuso", () => {
  assert.equal(startOfLocalDay("2026-10-21", TZ).toISOString(), "2026-10-21T03:00:00.000Z");
  assert.equal(startOfLocalDay("2026-10-21", "UTC").toISOString(), "2026-10-21T00:00:00.000Z");
  assert.equal(startOfLocalDay("2026-03-29", "Europe/Lisbon").toISOString(), "2026-03-29T00:00:00.000Z"); // dia da troca de horário
  assert.equal(startOfLocalDay("2026-07-01", "Europe/Lisbon").toISOString(), "2026-06-30T23:00:00.000Z");
});

test("ocorrências: em ordem, sem lote, com o local do período NA DATA", () => {
  const periods = [
    { id: "a", validFrom: new Date("2026-01-01T00:00:00Z"), validTo: new Date("2026-06-05T22:00:00Z"), label: "Varanda" },
    { id: "b", validFrom: new Date("2026-06-05T22:00:00Z"), validTo: null, label: "Sala" },
  ];
  const at = (iso: string) => new Date(iso);
  const items = buildOccurrences({
    periods,
    photos: [{ id: "p1", takenAt: at("2026-06-10T12:00:00Z"), caption: "Raízes", width: 1200, height: 1600 }],
    events: [
      { id: "e1", occurredAt: at("2026-06-10T12:00:00Z"), type: "new_root", notes: null, data: {}, batchId: null },
      { id: "e2", occurredAt: at("2026-03-01T12:00:00Z"), type: "watering", notes: null, data: {}, batchId: "lote" },
      { id: "e3", occurredAt: at("2026-03-01T12:00:00Z"), type: "watering", notes: null, data: {}, batchId: null },
    ],
    readings: [{ id: "r1", measuredAt: at("2025-12-01T12:00:00Z"), temperature: 18, humidity: null, notes: null }],
  });
  assert.deepEqual(
    items.map((i) => [i.kind, i.id, i.placeName]),
    [
      ["reading", "r1", null], // antes do primeiro período
      ["event", "e3", "Varanda"],
      ["photo", "p1", "Sala"], // mesmo instante: a foto vem antes do evento
      ["event", "e1", "Sala"],
    ],
  );
});
