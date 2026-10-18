import { test } from "node:test";
import assert from "node:assert/strict";
import { coordKey, planWeatherFetches } from "./weatherPlan.ts";

const BH = { lat: -19.9167, lng: -43.9345 };

test("mesma coordenada (até 4 casas) gera a mesma chave", () => {
  assert.equal(coordKey(BH), coordKey({ lat: -19.91672, lng: -43.93449 }));
  assert.notEqual(coordKey(BH), coordKey({ lat: -19.9168, lng: -43.9345 }));
});

test("plantas de usuários diferentes no mesmo ponto viram uma requisição só", () => {
  const plan = planWeatherFetches(
    [
      { locationId: "a", ...BH, missing: ["2026-10-14"] },
      { locationId: "b", ...BH, missing: ["2026-10-14"] },
      { locationId: "c", lat: BH.lat + 0.00001, lng: BH.lng, missing: ["2026-10-14"] },
    ],
    120,
  );
  assert.equal(plan.length, 1);
  assert.deepEqual([...plan[0]!.targets.keys()].sort(), ["a", "b", "c"]);
  assert.equal(plan[0]!.from, "2026-10-14");
  assert.equal(plan[0]!.to, "2026-10-14");
});

test("une lacunas do grupo e entrega cada dia só a quem falta", () => {
  const plan = planWeatherFetches(
    [
      { locationId: "velha", ...BH, missing: ["2026-10-10", "2026-10-11", "2026-10-12", "2026-10-14"] },
      { locationId: "nova", ...BH, missing: ["2026-10-13", "2026-10-14"] },
    ],
    120,
  );
  assert.equal(plan.length, 1);
  assert.equal(plan[0]!.from, "2026-10-10");
  assert.equal(plan[0]!.to, "2026-10-14");
  assert.deepEqual([...plan[0]!.targets.get("velha")!].sort(), ["2026-10-10", "2026-10-11", "2026-10-12", "2026-10-14"]);
  assert.deepEqual([...plan[0]!.targets.get("nova")!].sort(), ["2026-10-13", "2026-10-14"]);
});

test("faixas não contíguas e longas são quebradas; quem não falta nada fica de fora", () => {
  const plan = planWeatherFetches(
    [
      { locationId: "a", ...BH, missing: ["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04", "2026-01-05", "2026-03-01"] },
      { locationId: "b", ...BH, missing: [] },
    ],
    2,
  );
  assert.deepEqual(
    plan.map((p) => `${p.from}..${p.to}`),
    ["2026-01-01..2026-01-02", "2026-01-03..2026-01-04", "2026-01-05..2026-01-05", "2026-03-01..2026-03-01"],
  );
  assert.ok(plan.every((p) => !p.targets.has("b")));
});
