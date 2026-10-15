import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateForecast } from "./alertRules.ts";

const walkeriana = { tempNightMin: 10, tempDayMax: 35 };

test("avisa frio quando a mínima prevista chega perto do limite", () => {
  const a = evaluateForecast("Walkeriana <azul>", walkeriana, { date: "2026-06-20", tempMin: 10.8, tempMax: 22 });
  assert.equal(a.length, 1);
  assert.equal(a[0]!.kind, "cold");
  assert.ok(a[0]!.message.includes("&lt;azul&gt;"), "nome é escapado para HTML do Telegram");
});

test("avisa calor e não avisa em dia ameno", () => {
  assert.equal(evaluateForecast("X", walkeriana, { date: "2026-01-10", tempMin: 20, tempMax: 34.5 })[0]?.kind, "heat");
  assert.deepEqual(evaluateForecast("X", walkeriana, { date: "2026-04-10", tempMin: 15, tempMax: 27 }), []);
  assert.deepEqual(evaluateForecast("X", { tempNightMin: null, tempDayMax: null }, { date: "d", tempMin: -5, tempMax: 45 }), []);
});
