import assert from "node:assert/strict";
import { test } from "node:test";
import { climateSegments, climateWindows } from "./locations.ts";

const d = (iso: string) => new Date(iso);
const TZ = "America/Sao_Paulo";

/** Planta sem lugar: ela mesma é a fonte do clima. */
test("período sem lugar vira fonte da própria planta", () => {
  const segments = climateSegments(
    [{ id: "p1", placeId: null, validFrom: d("2026-01-10T12:00:00Z"), validTo: null }],
    [],
  );
  assert.deepEqual(segments, [{ source: { kind: "plant", id: "p1" }, validFrom: d("2026-01-10T12:00:00Z"), validTo: null }]);
});

/** Planta num lugar: a fonte é o período de localização do lugar. */
test("período num lugar usa a localização do lugar", () => {
  const segments = climateSegments(
    [{ id: "p1", placeId: "quarto", validFrom: d("2026-03-01T00:00:00Z"), validTo: null }],
    [{ id: "l1", placeId: "quarto", validFrom: d("2026-01-01T00:00:00Z"), validTo: null }],
  );
  assert.deepEqual(segments, [{ source: { kind: "place", id: "l1" }, validFrom: d("2026-03-01T00:00:00Z"), validTo: null }]);
});

/** O lugar mudou de coordenada no meio: a planta acompanha, em dois trechos. */
test("mudança do lugar parte a permanência em dois trechos", () => {
  const segments = climateSegments(
    [{ id: "p1", placeId: "quarto", validFrom: d("2026-01-01T00:00:00Z"), validTo: null }],
    [
      { id: "l1", placeId: "quarto", validFrom: d("2025-06-01T00:00:00Z"), validTo: d("2026-04-01T00:00:00Z") },
      { id: "l2", placeId: "quarto", validFrom: d("2026-04-01T00:00:00Z"), validTo: null },
    ],
  );
  assert.deepEqual(segments, [
    { source: { kind: "place", id: "l1" }, validFrom: d("2026-01-01T00:00:00Z"), validTo: d("2026-04-01T00:00:00Z") },
    { source: { kind: "place", id: "l2" }, validFrom: d("2026-04-01T00:00:00Z"), validTo: null },
  ]);
});

/** Períodos do lugar que não se cruzam com a permanência ficam de fora: nada retroativo. */
test("o passado do lugar não entra na planta que chegou depois", () => {
  const segments = climateSegments(
    [{ id: "p1", placeId: "quarto", validFrom: d("2026-05-01T00:00:00Z"), validTo: null }],
    [
      { id: "l1", placeId: "quarto", validFrom: d("2025-01-01T00:00:00Z"), validTo: d("2026-02-01T00:00:00Z") },
      { id: "l2", placeId: "quarto", validFrom: d("2026-02-01T00:00:00Z"), validTo: null },
    ],
  );
  assert.deepEqual(
    segments.map((s) => s.source.id),
    ["l2"],
  );
});

/** Mudou de lugar: o histórico guarda as duas fontes, cada uma no seu trecho. */
test("planta que muda de lugar mantém o trecho anterior", () => {
  const segments = climateSegments(
    [
      { id: "p1", placeId: "varanda", validFrom: d("2026-01-01T00:00:00Z"), validTo: d("2026-06-01T00:00:00Z") },
      { id: "p2", placeId: "quarto", validFrom: d("2026-06-01T00:00:00Z"), validTo: null },
    ],
    [
      { id: "lv", placeId: "varanda", validFrom: d("2025-01-01T00:00:00Z"), validTo: null },
      { id: "lq", placeId: "quarto", validFrom: d("2025-01-01T00:00:00Z"), validTo: null },
    ],
  );
  assert.deepEqual(
    segments.map((s) => s.source.id),
    ["lv", "lq"],
  );
});

/** As janelas recortam os trechos no intervalo consultado; o dia da mudança é do novo. */
test("janelas de dias recortam o intervalo consultado", () => {
  const segments = climateSegments(
    [
      { id: "p1", placeId: null, validFrom: d("2026-05-20T10:00:00Z"), validTo: d("2026-06-10T10:00:00Z") },
      { id: "p2", placeId: null, validFrom: d("2026-06-10T10:00:00Z"), validTo: null },
    ],
    [],
  );
  const windows = climateWindows(segments, TZ, "2026-06-01", "2026-06-15");
  assert.deepEqual(windows, [
    { source: { kind: "plant", id: "p1" }, from: "2026-06-01", to: "2026-06-09" },
    { source: { kind: "plant", id: "p2" }, from: "2026-06-10", to: "2026-06-15" },
  ]);
});
