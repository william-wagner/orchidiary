import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyOutcome, describeFetchError, errorExcerpt, redactUrl, sanitizeMeta, scrubSecrets } from "./externalCalls.ts";

test("Telegram: o token sai do caminho e a query some", () => {
  const r = redactUrl("telegram", "https://api.telegram.org/bot123456789:AAEhBP0av28dLoOvaUFZ_abcdefghijklmnop/sendMessage?x=1");
  assert.deepEqual(r, { host: "api.telegram.org", path: "/bot[redigido]/sendMessage", query: null });
});

test("Open-Meteo: coordenadas arredondadas e só parâmetros conhecidos", () => {
  const r = redactUrl(
    "open_meteo",
    "https://api.open-meteo.com/v1/forecast?latitude=-23.5505&longitude=-46.6333&start_date=2026-10-01&end_date=2026-10-02&timezone=America%2FSao_Paulo&apikey=segredo&extra=1",
  );
  assert.equal(r.host, "api.open-meteo.com");
  assert.equal(r.path, "/v1/forecast");
  assert.equal(r.query, "latitude=-23.55&longitude=-46.63&start_date=2026-10-01&end_date=2026-10-02&timezone=America/Sao_Paulo");
});

test("Nominatim: lat/lon arredondados", () => {
  const r = redactUrl("nominatim", "https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&lat=-23.55052&lon=-46.63331");
  assert.equal(r.query, "format=jsonv2&zoom=10&lat=-23.55&lon=-46.63");
});

test("Google: a query inteira é descartada, o id do arquivo no caminho fica", () => {
  const r = redactUrl("google_drive", "https://www.googleapis.com/drive/v3/files/abc123?q=name%3D'Meu%20Jardim'&fields=id");
  assert.deepEqual(r, { host: "www.googleapis.com", path: "/drive/v3/files/abc123", query: null });
  assert.equal(redactUrl("google_oauth", "https://oauth2.googleapis.com/token?code=4/0AXYZ").query, null);
});

test("URL inválida não lança", () => {
  assert.deepEqual(redactUrl("openai", "isso não é url"), { host: "", path: "isso não é url", query: null });
});

test("scrubSecrets cobre os formatos conhecidos", () => {
  const casos = [
    "falhou em https://api.telegram.org/bot123456789:AAEhBP0av28dLoOvaUFZ_abcdefghijklmnop/sendMessage",
    "Authorization: Bearer ya29.a0AfH6SMBxyz-123",
    "chave sk-proj-abcdefghijklmnopqrstuvwxyz",
    "refresh 1//0gAbCdEfGhIjKlMnOpQrStUv",
    "GET /x?code=4/0AXYZ&state=1",
    '{"access_token":"ya29.abc","expires_in":3599}',
  ];
  for (const c of casos) {
    const out = scrubSecrets(c);
    assert.ok(out.includes("[redigido]"), out);
    assert.ok(!/AAEhBP0av28|ya29\.|sk-proj|0gAbCd|4\/0AXYZ/.test(out), out);
  }
  assert.equal(scrubSecrets("texto comum, sem segredo"), "texto comum, sem segredo");
});

test("errorExcerpt limita, compacta espaços e remove nulos", () => {
  assert.equal(errorExcerpt("a\n\n  b\u0000c"), "a bc");
  const long = errorExcerpt("x".repeat(900));
  assert.equal(long.length, 501);
  assert.ok(long.endsWith("…"));
});

test("sanitizeMeta: redige, passa objetos pequenos e corta os grandes", () => {
  assert.deepEqual(sanitizeMeta(undefined), {});
  assert.deepEqual(sanitizeMeta({ model: "m", n: 2 }), { model: "m", n: 2 });
  assert.deepEqual(sanitizeMeta({ url: "https://x/?token=abc" }), { url: "https://x/?token=[redigido]" });
  assert.deepEqual(sanitizeMeta({ lixo: "x".repeat(5_000) }), { truncated: true });
});

test("classifyOutcome", () => {
  assert.equal(classifyOutcome({ status: 200 }), "ok");
  assert.equal(classifyOutcome({ status: 204 }), "ok");
  assert.equal(classifyOutcome({ status: 429 }), "http_error");
  assert.equal(classifyOutcome({ status: 503 }), "http_error");
  assert.equal(classifyOutcome({ status: 200, invalidResponse: true }), "invalid_response");
  assert.equal(classifyOutcome({ errorName: "TimeoutError" }), "timeout");
  assert.equal(classifyOutcome({ errorName: "TypeError" }), "network_error");
  assert.equal(classifyOutcome({}), "http_error");
});

test("describeFetchError usa cause.code quando existe", () => {
  const err = new TypeError("fetch failed", { cause: { code: "ENOTFOUND" } });
  assert.deepEqual(describeFetchError(err), { name: "TypeError", code: "ENOTFOUND", message: "fetch failed" });
  assert.equal(describeFetchError(new Error("x")).code, "Error");
  assert.equal(describeFetchError("texto").code, "unknown");
});
