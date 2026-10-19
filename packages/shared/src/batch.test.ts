import { test } from "node:test";
import assert from "node:assert/strict";
import { batchDefaults, exclusionsToRemember, joinsBatch, placeReadingsForPlant } from "./batch.ts";

const TZ = "America/Sao_Paulo";

test("lote: todas marcadas quando não há duplicado nem exclusão lembrada", () => {
  const d = batchDefaults({ plantIds: ["a", "b"], recent: [], remembered: [], day: "2026-10-19", timeZone: TZ });
  assert.deepEqual(d.checked, ["a", "b"]);
  assert.deepEqual(d.skipped, {});
});

test("lote: a mesma ação no dia local vem desmarcada; no dia anterior, não", () => {
  const d = batchDefaults({
    plantIds: ["a", "b", "c"],
    recent: [
      { plantId: "a", occurredAt: new Date("2026-10-19T11:12:00Z") }, // 08:12 em SP
      { plantId: "b", occurredAt: new Date("2026-10-19T02:00:00Z") }, // 23:00 do dia 18 em SP
    ],
    remembered: [],
    day: "2026-10-19",
    timeZone: TZ,
  });
  assert.deepEqual(d.checked, ["b", "c"]);
  assert.deepEqual(d.skipped.a, { kind: "duplicate", at: new Date("2026-10-19T11:12:00Z") });
});

test("lote: o duplicado guarda o horário mais recente do dia", () => {
  const d = batchDefaults({
    plantIds: ["a"],
    recent: [
      { plantId: "a", occurredAt: new Date("2026-10-19T11:00:00Z") },
      { plantId: "a", occurredAt: new Date("2026-10-19T15:00:00Z") },
    ],
    remembered: [],
    day: "2026-10-19",
    timeZone: TZ,
  });
  assert.deepEqual(d.skipped.a, { kind: "duplicate", at: new Date("2026-10-19T15:00:00Z") });
});

test("lote: exclusão lembrada vem desmarcada, mas o duplicado tem prioridade no motivo", () => {
  const d = batchDefaults({
    plantIds: ["a", "b", "c"],
    recent: [{ plantId: "a", occurredAt: new Date("2026-10-19T12:00:00Z") }],
    remembered: ["a", "b"],
    day: "2026-10-19",
    timeZone: TZ,
  });
  assert.deepEqual(d.checked, ["c"]);
  assert.equal(d.skipped.a?.kind, "duplicate");
  assert.equal(d.skipped.b?.kind, "remembered");
});

test("lote: só as desmarcadas por escolha são lembradas", () => {
  const skipped = { a: { kind: "duplicate" as const, at: new Date() }, b: { kind: "remembered" as const } };
  // b continuou desmarcada, c foi desmarcada agora, a saiu por duplicado
  assert.deepEqual(exclusionsToRemember(["a", "b", "c", "d"], ["d"], skipped), ["b", "c"]);
  // incluir de volta esquece a exclusão
  assert.deepEqual(exclusionsToRemember(["a", "b"], ["b"], skipped), []);
});

test("lote: doadas e mortas não entram", () => {
  assert.equal(joinsBatch("active"), true);
  assert.equal(joinsBatch("dormant"), true);
  assert.equal(joinsBatch("dead"), false);
  assert.equal(joinsBatch("given_away"), false);
});

test("medição do lugar vale só enquanto a planta esteve lá", () => {
  const periods = [
    { id: "p1", placeId: "quarto", validFrom: new Date("2026-01-01"), validTo: new Date("2026-06-01") },
    { id: "p2", placeId: "varanda", validFrom: new Date("2026-06-01"), validTo: null },
  ];
  const readings = [
    { id: "r1", placeId: "quarto", measuredAt: new Date("2026-03-10") }, // estava no quarto
    { id: "r2", placeId: "quarto", measuredAt: new Date("2026-07-10") }, // já tinha saído
    { id: "r3", placeId: "varanda", measuredAt: new Date("2026-05-10") }, // ainda não tinha chegado
    { id: "r4", placeId: "varanda", measuredAt: new Date("2026-07-10") },
  ];
  assert.deepEqual(
    placeReadingsForPlant(readings, periods).map((r) => r.id),
    ["r1", "r4"],
  );
});
