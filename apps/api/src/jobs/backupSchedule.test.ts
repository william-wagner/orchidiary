import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldRunBackup } from "./backupSchedule.ts";

const tz = "America/Sao_Paulo";
// 2026-10-18 é domingo. 06:00 UTC = 03:00 em São Paulo.
const sunday3am = new Date("2026-10-18T06:00:00Z");

test("roda no domingo às 3h se a última foi há uma semana", () => {
  const last = new Date("2026-10-11T06:05:00Z");
  assert.equal(shouldRunBackup({ now: sunday3am, timeZone: tz, weekday: 0, hour: 3, lastSuccessAt: last }), true);
});

test("não roda duas vezes no mesmo domingo", () => {
  const last = new Date("2026-10-18T06:01:00Z");
  const later = new Date("2026-10-18T09:00:00Z");
  assert.equal(shouldRunBackup({ now: later, timeZone: tz, weekday: 0, hour: 3, lastSuccessAt: last }), false);
});

test("não roda antes do horário nem em outro dia", () => {
  const last = new Date("2026-10-11T06:05:00Z");
  assert.equal(shouldRunBackup({ now: new Date("2026-10-18T04:00:00Z"), timeZone: tz, weekday: 0, hour: 3, lastSuccessAt: last }), false);
  assert.equal(shouldRunBackup({ now: new Date("2026-10-16T06:00:00Z"), timeZone: tz, weekday: 0, hour: 3, lastSuccessAt: last }), false);
});

test("recupera backup atrasado quando o PC volta a ligar", () => {
  const last = new Date("2026-10-04T06:00:00Z");
  assert.equal(shouldRunBackup({ now: new Date("2026-10-13T15:00:00Z"), timeZone: tz, weekday: 0, hour: 3, lastSuccessAt: last }), true);
  assert.equal(shouldRunBackup({ now: sunday3am, timeZone: tz, weekday: 0, hour: 3, lastSuccessAt: null }), true);
});
