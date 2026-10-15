import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toLogRow } from "./logRow.ts";

const line = (o: Record<string, unknown>) => JSON.stringify({ time: 1_760_000_000_000, ...o });
const UID = "11111111-2222-3333-4444-555555555555";

describe("toLogRow", () => {
  it("ignora info e debug comuns", () => {
    assert.equal(toLogRow(line({ level: 30, msg: "requisição", source: "http" })), null);
    assert.equal(toLogRow(line({ level: 20, msg: "x" })), null);
  });

  it("ignora linhas que não são JSON", () => {
    assert.equal(toLogRow("isto não é json"), null);
    assert.equal(toLogRow("null"), null);
  });

  it("grava warn e error com origem, request e usuário", () => {
    const row = toLogRow(line({ level: 50, msg: "falhou", source: "backup", requestId: "r1", userId: UID, trigger: "manual" }));
    assert.ok(row);
    assert.equal(row.level, "error");
    assert.equal(row.source, "backup");
    assert.equal(row.requestId, "r1");
    assert.equal(row.userId, UID);
    assert.deepEqual(row.context, { trigger: "manual" });
    assert.equal(row.createdAt.getTime(), 1_760_000_000_000);
  });

  it("grava auditoria mesmo em info e usa o nível 'audit'", () => {
    const row = toLogRow(line({ level: 30, audit: true, event: "auth.login", msg: "login realizado", source: "audit" }));
    assert.ok(row);
    assert.equal(row.level, "audit");
    assert.deepEqual(row.context, { event: "auth.login" });
  });

  it("extrai mensagem e stack do erro serializado", () => {
    const row = toLogRow(line({ level: 60, err: { type: "TypeError", message: "boom", stack: "TypeError: boom\n at x" } }));
    assert.ok(row);
    assert.equal(row.level, "fatal");
    assert.equal(row.message, "boom");
    assert.equal(row.errorStack, "TypeError: boom\n at x");
    assert.equal(row.context.errorType, "TypeError");
    assert.equal(row.source, "app");
  });

  it("não deixa userId inválido quebrar a chave estrangeira", () => {
    const row = toLogRow(line({ level: 40, msg: "x", userId: "não-é-uuid" }));
    assert.ok(row);
    assert.equal(row.userId, null);
    assert.equal(row.context.userId, "não-é-uuid");
  });

  it("remove caracteres nulos e trunca contexto gigante", () => {
    const row = toLogRow(line({ level: 40, msg: "a\u0000b", blob: "x".repeat(40_000) }));
    assert.ok(row);
    assert.equal(row.message, "ab");
    assert.equal(row.context.truncated, true);
  });
});
