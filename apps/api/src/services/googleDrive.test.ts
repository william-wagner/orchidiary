import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAuthUrl, buildMultipart, DriveClient, emailFromIdToken } from "./googleDrive.ts";

test("URL de autorização pede acesso offline e escopo drive.file", () => {
  const url = new URL(buildAuthUrl({ clientId: "abc.apps.googleusercontent.com", redirectUri: "https://pc.ts.net/api/x", state: "s1" }));
  assert.equal(url.searchParams.get("access_type"), "offline");
  assert.ok(url.searchParams.get("scope")!.includes("drive.file"));
  assert.equal(url.searchParams.get("state"), "s1");
});

test("multipart do upload contém metadados e conteúdo", () => {
  const { body, contentType } = buildMultipart({ name: "a.json.gz", parents: ["p"] }, "application/gzip", Buffer.from("DADOS"));
  const boundary = contentType.split("boundary=")[1]!;
  const text = body.toString("utf8");
  assert.ok(text.startsWith(`--${boundary}\r\n`));
  assert.ok(text.includes('"name":"a.json.gz"'));
  assert.ok(text.includes("\r\n\r\nDADOS\r\n"));
  assert.ok(text.endsWith(`--${boundary}--`));
});

test("e-mail é lido do id_token", () => {
  const payload = Buffer.from(JSON.stringify({ email: "w@exemplo.com" })).toString("base64url");
  assert.equal(emailFromIdToken(`x.${payload}.y`), "w@exemplo.com");
  assert.equal(emailFromIdToken("lixo"), undefined);
});

test("cliente renova o token uma vez e reaproveita", async () => {
  const calls: string[] = [];
  const fake = (async (url: string | URL) => {
    const u = String(url);
    calls.push(u);
    if (u.includes("oauth2.googleapis.com/token")) return Response.json({ access_token: "AT" });
    if (u.includes("/files?q=")) return Response.json({ files: [] });
    return Response.json({ id: "folder1" });
  }) as unknown as typeof fetch;
  const c = new DriveClient({ clientId: "c", clientSecret: "s", refreshToken: "r" }, fake);
  assert.equal(await c.ensureFolder("Orchidiary"), "folder1");
  assert.equal(await c.ensureFolder("backups", "folder1"), "folder1");
  assert.equal(calls.filter((u) => u.includes("/token")).length, 1);
});
