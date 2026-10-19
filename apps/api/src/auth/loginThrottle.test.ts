import { test } from "node:test";
import assert from "node:assert/strict";
import { createLoginThrottle } from "./loginThrottle.ts";

function setup() {
  let t = 0;
  const th = createLoginThrottle({ windowMs: 60_000, maxPerAccount: 3, maxPerIp: 5, now: () => t });
  return { th, advance: (ms: number) => (t += ms) };
}

test("bloqueia a conta depois do limite e libera ao fim da janela", () => {
  const { th, advance } = setup();
  for (let i = 0; i < 3; i++) {
    assert.equal(th.blockedFor("a@x", "1.1.1.1"), 0);
    th.fail("a@x", "1.1.1.1");
  }
  assert.equal(th.blockedFor("a@x", "1.1.1.1"), 60);
  advance(30_000);
  assert.equal(th.blockedFor("a@x", "1.1.1.1"), 30);
  // outro IP para a mesma conta segue liberado
  assert.equal(th.blockedFor("a@x", "2.2.2.2"), 0);
  advance(30_000);
  assert.equal(th.blockedFor("a@x", "1.1.1.1"), 0);
});

test("bloqueia o IP que testa vários e-mails", () => {
  const { th } = setup();
  for (let i = 0; i < 5; i++) th.fail(`u${i}@x`, "9.9.9.9");
  assert.ok(th.blockedFor("novo@x", "9.9.9.9") > 0);
  assert.equal(th.blockedFor("novo@x", "8.8.8.8"), 0);
});

test("login certo zera o contador da conta", () => {
  const { th } = setup();
  th.fail("a@x", "1.1.1.1");
  th.fail("a@x", "1.1.1.1");
  th.succeed("a@x", "1.1.1.1");
  th.fail("a@x", "1.1.1.1");
  th.fail("a@x", "1.1.1.1");
  assert.equal(th.blockedFor("a@x", "1.1.1.1"), 0);
});

test("sweep descarta janelas vencidas", () => {
  const { th, advance } = setup();
  th.fail("a@x", "1.1.1.1");
  assert.equal(th.size, 2);
  advance(60_000);
  th.sweep();
  assert.equal(th.size, 0);
});
