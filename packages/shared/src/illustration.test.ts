import { test } from "node:test";
import assert from "node:assert/strict";
import { ILLUSTRATION_RETRY_MS, ILLUSTRATION_STALE_MS, illustrationPrompt, needsIllustration } from "./illustration.ts";

const now = new Date("2026-10-15T12:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);

test("capa sem ilustração precisa de uma", () => {
  assert.equal(needsIllustration({ status: null, updatedAt: null }, now), true);
});

test("ilustração pronta não é gerada de novo", () => {
  assert.equal(needsIllustration({ status: "ready", updatedAt: ago(ILLUSTRATION_RETRY_MS * 10) }, now), false);
});

test("falha só é repetida depois do intervalo", () => {
  assert.equal(needsIllustration({ status: "error", updatedAt: ago(60_000) }, now), false);
  assert.equal(needsIllustration({ status: "error", updatedAt: ago(ILLUSTRATION_RETRY_MS) }, now), true);
});

test("pendente recente aguarda; pendente antigo foi interrompido e é retomado", () => {
  assert.equal(needsIllustration({ status: "pending", updatedAt: ago(60_000) }, now), false);
  assert.equal(needsIllustration({ status: "pending", updatedAt: ago(ILLUSTRATION_STALE_MS) }, now), true);
});

test("prompt cita o táxon quando conhecido", () => {
  assert.ok(illustrationPrompt("Vanda (híbridos)").includes("Vanda (híbridos)"));
  assert.ok(illustrationPrompt(null).includes("a orquídea da foto"));
});
