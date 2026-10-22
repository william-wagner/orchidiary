import { test } from "node:test";
import assert from "node:assert/strict";
import { BatchWriter } from "./batchWriter.ts";

const quiet = { flushEveryMs: 60_000 };

test("grava em lotes do tamanho configurado", async () => {
  const batches: number[][] = [];
  const w = new BatchWriter<number>({ label: "t", insert: async (r) => void batches.push(r), batchSize: 3, ...quiet });
  [1, 2].forEach((n) => w.push(n));
  assert.equal(w.pending, 2);
  w.push(3); // completa o lote e dispara a gravação
  [4, 5].forEach((n) => w.push(n));
  await w.flush();
  assert.deepEqual(batches.flat(), [1, 2, 3, 4, 5]);
  assert.ok(batches.every((b) => b.length <= 3));
  assert.equal(w.pending, 0);
});

test("falha no banco devolve o lote ao buffer e tenta de novo", async () => {
  let fail = true;
  const saved: number[] = [];
  const w = new BatchWriter<number>({
    label: "t",
    insert: async (r) => {
      if (fail) throw new Error("banco fora");
      saved.push(...r);
    },
    batchSize: 10,
    ...quiet,
  });
  [1, 2, 3].forEach((n) => w.push(n));
  await w.flush();
  assert.equal(w.pending, 3);
  assert.deepEqual(saved, []);
  fail = false;
  w.push(4);
  await w.flush();
  assert.deepEqual(saved, [1, 2, 3, 4]); // ordem preservada
});

test("buffer cheio descarta os mais antigos", async () => {
  const saved: number[] = [];
  let fail = true;
  const w = new BatchWriter<number>({
    label: "t",
    insert: async (r) => {
      if (fail) throw new Error("x");
      saved.push(...r);
    },
    batchSize: 1000,
    maxBuffer: 3,
    ...quiet,
  });
  [1, 2, 3, 4, 5].forEach((n) => w.push(n));
  assert.equal(w.pending, 3);
  fail = false;
  await w.flush();
  assert.deepEqual(saved, [3, 4, 5]);
});

test("flush simultâneos compartilham a mesma gravação", async () => {
  let calls = 0;
  const w = new BatchWriter<number>({ label: "t", insert: async () => void calls++, batchSize: 100, ...quiet });
  w.push(1);
  await Promise.all([w.flush(), w.flush(), w.flush()]);
  assert.equal(calls, 1);
});
