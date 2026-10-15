import { test } from "node:test";
import assert from "node:assert/strict";
import { canBeChildOf, isSupraspecific, taxonNameError, type TaxonRank } from "@orchidiary/shared";
import { type CatalogNode, catalog } from "./catalog.ts";

function walk(nodes: CatalogNode[], parent: CatalogNode | null, visit: (n: CatalogNode, p: CatalogNode | null) => void) {
  for (const n of nodes) {
    visit(n, parent);
    walk(n.children ?? [], n, visit);
  }
}

test("catálogo respeita a hierarquia e a grafia de cada nível", () => {
  const problems: string[] = [];
  walk(catalog, null, (n, p) => {
    if (!canBeChildOf(n.rank, p?.rank ?? null)) problems.push(`${n.rank} ${n.name} abaixo de ${p?.rank ?? "nada"} ${p?.name ?? ""}`);
    const err = taxonNameError(n.rank, n.name);
    if (err) problems.push(`${n.name}: ${err}`);
  });
  assert.deepEqual(problems, []);
});

test("catálogo não repete táxon", () => {
  const higher = new Set<string>();
  const dupes: string[] = [];
  const checkSiblings = (nodes: CatalogNode[], path: string) => {
    const seen = new Set<string>();
    for (const n of nodes) {
      const key = `${n.rank}:${n.name}`;
      if (seen.has(key)) dupes.push(`${path} › ${n.name}`);
      seen.add(key);
      if (isSupraspecific(n.rank)) {
        if (higher.has(key)) dupes.push(`${n.rank} ${n.name} (nome repetido no catálogo)`);
        higher.add(key);
      }
      checkSiblings(n.children ?? [], `${path} › ${n.name}`);
    }
  };
  checkSiblings(catalog, "");
  assert.deepEqual(dupes, []);
});

test("catálogo é ambicioso", () => {
  const count: Partial<Record<TaxonRank, number>> = {};
  walk(catalog, null, (n) => (count[n.rank] = (count[n.rank] ?? 0) + 1));
  assert.ok((count.genus ?? 0) >= 150, `gêneros: ${count.genus}`);
  assert.ok((count.species ?? 0) >= 800, `espécies: ${count.species}`);
});
