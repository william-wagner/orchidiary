import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { hashPassword, verifyPassword } from "./password.ts";
import { decryptJson, encryptJson } from "../lib/secrets.ts";

test("hash de senha confere e rejeita senha errada", async () => {
  const h = await hashPassword("orquídea-123");
  assert.ok(h.startsWith("scrypt$"));
  assert.equal(await verifyPassword("orquídea-123", h), true);
  assert.equal(await verifyPassword("outra", h), false);
  assert.equal(await verifyPassword("x", "lixo"), false);
});

test("segredos de integração vão e voltam criptografados", () => {
  const k = randomBytes(32).toString("base64");
  const enc = encryptJson({ botToken: "123:abc" }, k);
  assert.ok(!enc.includes("abc"));
  assert.deepEqual(decryptJson(enc, k), { botToken: "123:abc" });
  assert.throws(() => decryptJson(enc, randomBytes(32).toString("base64")));
  assert.throws(() => encryptJson({}, undefined), /SECRETS_KEY/);
});
