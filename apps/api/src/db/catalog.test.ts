import { test } from "node:test";
import assert from "node:assert/strict";
import { canBeChildOf, isOriginCountry, isSupraspecific, taxonFullName, taxonNameError, type TaxonRank } from "@orchidiary/shared";
import { type CatalogNode, catalog } from "./catalog.ts";
import { catalogOrigins, orphanAlsoIn } from "./catalogOrigins.ts";

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

test("todo país de origem aponta para uma espécie do catálogo", () => {
  const species = new Set<string>();
  const collect = (nodes: CatalogNode[], lineage: { rank: TaxonRank; name: string }[]) => {
    for (const n of nodes) {
      const here = [...lineage, { rank: n.rank, name: n.name }];
      if (n.rank === "species") species.add(taxonFullName(here));
      collect(n.children ?? [], here);
    }
  };
  collect(catalog, []);
  const unknown = [...catalogOrigins.keys()].filter((name) => !species.has(name));
  assert.deepEqual(unknown, []);
  assert.deepEqual(orphanAlsoIn, [], "países extras de espécie sem país principal");
  assert.ok(catalogOrigins.size >= 800, `espécies com origem: ${catalogOrigins.size}`);
});

test("países de ocorrência são da lista e não se repetem", () => {
  const problems = [...catalogOrigins].filter(
    ([, codes]) => !codes.every(isOriginCountry) || new Set(codes).size !== codes.length,
  );
  assert.deepEqual(problems, []);
});
