import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Garante que todo acesso à rede do app passe pelo cliente instrumentado (http/client.ts):
 * uma chamada feita com fetch direto não aparece em external_calls.
 */
const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
// index.ts usa `fetch: app.fetch` (servidor Hono, não é chamada de saída); client.ts é o único lugar do fetch real
const ALLOWED = new Set(["http/client.ts", "index.ts"]);

function* sources(dir: string): Generator<string> {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* sources(p);
    else if (e.name.endsWith(".ts") && !e.name.endsWith(".test.ts")) yield p;
  }
}

test("nenhum serviço chama fetch direto", () => {
  const offenders: string[] = [];
  for (const file of sources(SRC)) {
    const rel = relative(SRC, file).replaceAll("\\", "/");
    if (ALLOWED.has(rel)) continue;
    const code = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    if (/(?<![\w.])fetch\s*\(|typeof fetch|\bfetchImpl\b/.test(code)) offenders.push(rel);
  }
  assert.deepEqual(offenders, [], "use http.<serviço>.call(...) de http/clients.ts");
});
