import { test } from "node:test";
import assert from "node:assert/strict";
import type { ExternalCallRecord } from "@orchidiary/shared";
import { type CallSink, createHttpClient, requestBodySize } from "./client.ts";
import { runWithContext } from "./context.ts";

const UID = "6f1c2f6e-0a52-4e0d-9d5e-0e5b4c1f7a11";

function setup(base: typeof fetch, service: "telegram" | "open_meteo" | "openai" = "telegram") {
  const rows: ExternalCallRecord[] = [];
  const sink: CallSink = { record: (r) => void rows.push(r) };
  return { rows, client: createHttpClient({ service, sink, baseFetch: base }) };
}

const TG = "https://api.telegram.org/bot123456789:AAEhBP0av28dLoOvaUFZ_abcdefghijklmnop/sendMessage";

test("sucesso: grava uma linha com url redigida, contexto e duração", async () => {
  const { rows, client } = setup((async () => Response.json({ ok: true }, { headers: { "content-length": "11" } })) as unknown as typeof fetch);
  const out = await runWithContext({ requestId: "req-1", origin: "http", userId: UID }, () =>
    client.call(
      { operation: "sendMessage", url: TG, init: { method: "post", body: JSON.stringify({ text: "oi" }) }, meta: { chat: "x" } },
      async (res, scope) => {
        scope.annotate({ extra: 1 });
        return (await res.json()) as { ok: boolean };
      },
    ),
  );
  assert.deepEqual(out, { ok: true });
  assert.equal(rows.length, 1);
  const r = rows[0]!;
  assert.equal(r.outcome, "ok");
  assert.equal(r.status, 200);
  assert.equal(r.method, "POST");
  assert.equal(r.path, "/bot[redigido]/sendMessage");
  assert.equal(r.host, "api.telegram.org");
  assert.equal(r.requestId, "req-1");
  assert.equal(r.origin, "http");
  assert.equal(r.userId, UID);
  assert.equal(r.requestBytes, 13);
  assert.equal(r.responseBytes, 11);
  assert.equal(r.errorCode, null);
  assert.deepEqual(r.meta, { chat: "x", extra: 1 });
  assert.ok(r.durationMs >= 0 && r.ttfbMs !== null);
  assert.ok(!JSON.stringify(r).includes("AAEhBP0av28"));
});

test("sem contexto: requestId e origin ficam nulos", async () => {
  const { rows, client } = setup((async () => new Response("{}")) as unknown as typeof fetch);
  await client.call({ operation: "x", url: TG }, (res) => res.text());
  assert.equal(rows[0]!.requestId, null);
  assert.equal(rows[0]!.origin, null);
  assert.equal(rows[0]!.userId, null);
});

test("status de erro: http_error com trecho do corpo, e o erro do handler é relançado", async () => {
  const { rows, client } = setup(
    (async () => new Response(`{"ok":false,"description":"Forbidden: bot was blocked ${TG}"}`, { status: 403 })) as unknown as typeof fetch,
  );
  await assert.rejects(
    client.call({ operation: "sendMessage", url: TG }, async (res) => {
      throw new Error(`Telegram ${res.status}`);
    }),
    /Telegram 403/,
  );
  const r = rows[0]!;
  assert.equal(r.outcome, "http_error");
  assert.equal(r.status, 403);
  assert.equal(r.errorCode, "HTTP_403");
  assert.ok(r.errorExcerpt?.includes("bot was blocked"));
  assert.ok(!r.errorExcerpt?.includes("AAEhBP0av28"), "token redigido no trecho");
});

test("2xx com handler que falha: invalid_response", async () => {
  const { rows, client } = setup((async () => Response.json({ data: [] })) as unknown as typeof fetch, "openai");
  await assert.rejects(
    client.call({ operation: "images.edits", url: "https://api.openai.com/v1/images/edits" }, async () => {
      throw new Error("resposta sem imagem");
    }),
    /sem imagem/,
  );
  assert.equal(rows[0]!.outcome, "invalid_response");
  assert.equal(rows[0]!.status, 200);
  assert.equal(rows[0]!.errorExcerpt, "resposta sem imagem");
});

test("falha de rede: network_error com o código da causa, sem status", async () => {
  const { rows, client } = setup((async () => {
    throw new TypeError("fetch failed", { cause: { code: "ENOTFOUND" } });
  }) as unknown as typeof fetch);
  await assert.rejects(client.call({ operation: "x", url: TG }, (r) => r.text()), /fetch failed/);
  const r = rows[0]!;
  assert.equal(r.outcome, "network_error");
  assert.equal(r.status, null);
  assert.equal(r.ttfbMs, null);
  assert.equal(r.errorCode, "ENOTFOUND");
});

test("timeout (antes ou durante a leitura do corpo): outcome timeout", async () => {
  const { rows, client } = setup((async (_u: unknown, init?: RequestInit) => {
    const keepAlive = setInterval(() => {}, 1_000); // AbortSignal.timeout não segura o processo
    try {
      await new Promise((_, rej) => init?.signal?.addEventListener("abort", () => rej(init.signal!.reason)));
    } finally {
      clearInterval(keepAlive);
    }
    return new Response();
  }) as unknown as typeof fetch);
  await assert.rejects(client.call({ operation: "x", url: TG, init: { signal: AbortSignal.timeout(20) } }, (r) => r.text()));
  assert.equal(rows[0]!.outcome, "timeout");
  assert.equal(rows[0]!.errorCode, "TimeoutError");

  const { rows: rows2, client: c2 } = setup((async () => new Response("ok")) as unknown as typeof fetch);
  await assert.rejects(
    c2.call({ operation: "x", url: TG }, async () => {
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    }),
  );
  assert.equal(rows2[0]!.outcome, "timeout");
});

test("um sink que falha não atrapalha a chamada", async () => {
  const client = createHttpClient({
    service: "telegram",
    sink: { record: () => { throw new Error("sink quebrado"); } },
    baseFetch: (async () => new Response("ok")) as unknown as typeof fetch,
  });
  assert.equal(await client.call({ operation: "x", url: TG }, (r) => r.text()), "ok");
});

test("query do Open-Meteo sai redigida e com coordenadas arredondadas", async () => {
  const { rows, client } = setup((async () => new Response("{}")) as unknown as typeof fetch, "open_meteo");
  await client.call(
    { operation: "forecast.daily", url: "https://api.open-meteo.com/v1/forecast?latitude=-23.5505&longitude=-46.6333&timezone=America%2FSao_Paulo" },
    (r) => r.text(),
  );
  assert.equal(rows[0]!.query, "latitude=-23.55&longitude=-46.63&timezone=America/Sao_Paulo");
});

test("requestBodySize", () => {
  assert.equal(requestBodySize(undefined), 0);
  assert.equal(requestBodySize("çã"), 4);
  assert.equal(requestBodySize(new URLSearchParams({ a: "b" })), 3);
  assert.equal(requestBodySize(new Uint8Array(10)), 10);
  assert.equal(requestBodySize(new Blob(["abc"])), 3);
  const fd = new FormData();
  fd.set("k", "vv");
  fd.set("f", new Blob(["12345"]), "a.bin");
  assert.equal(requestBodySize(fd), 1 + 2 + 1 + 5);
});
