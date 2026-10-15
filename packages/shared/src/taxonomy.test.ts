import { test } from "node:test";
import assert from "node:assert/strict";
import type { TaxonNode } from "./taxonomy.ts";
import {
  canBeChildOf,
  hasOwnCare,
  inheritCare,
  normalizeSearch,
  taxonFullName,
  taxonNameError,
  taxonNameParts,
  taxonSearchText,
} from "./taxonomy.ts";

const vanda: TaxonNode[] = [
  { rank: "family", name: "Orchidaceae" },
  { rank: "subfamily", name: "Epidendroideae" },
  { rank: "tribe", name: "Vandeae" },
  { rank: "subtribe", name: "Aeridinae" },
  { rank: "genus", name: "Vanda" },
];

test("nome completo segue a convenção botânica", () => {
  assert.equal(taxonFullName(vanda), "Vanda");
  assert.equal(taxonFullName(vanda.slice(0, 3)), "Vandeae");
  const coerulea = [...vanda, { rank: "species", name: "coerulea" } as const];
  assert.equal(taxonFullName(coerulea), "Vanda coerulea");
  assert.equal(taxonFullName([...coerulea, { rank: "variety", name: "alba" }]), "Vanda coerulea var. alba");
  assert.equal(taxonFullName([...coerulea, { rank: "subspecies", name: "x" }, { rank: "form", name: "alba" }]), "Vanda coerulea subsp. x f. alba");
  const grex = [...vanda, { rank: "hybrid", name: "Sansai Blue" } as const];
  assert.equal(taxonFullName(grex), "Vanda Sansai Blue");
  assert.equal(taxonFullName([...grex, { rank: "cultivar", name: "Azul Real" }]), "Vanda Sansai Blue 'Azul Real'");
});

test("itálico só em gênero, espécie e infraespecíficos; grex e cultivar em redondo", () => {
  assert.deepEqual(taxonNameParts([...vanda, { rank: "species", name: "coerulea" }, { rank: "variety", name: "alba" }]), [
    { text: "Vanda coerulea", italic: true },
    { text: " var. ", italic: false },
    { text: "alba", italic: true },
  ]);
  assert.deepEqual(taxonNameParts([...vanda, { rank: "hybrid", name: "Sansai Blue" }]), [
    { text: "Vanda", italic: true },
    { text: " Sansai Blue", italic: false },
  ]);
  assert.deepEqual(taxonNameParts(vanda.slice(0, 1)), [{ text: "Orchidaceae", italic: false }]);
  assert.deepEqual(taxonNameParts([]), []);
});

test("hierarquia: só pais compatíveis, pulando níveis quando preciso", () => {
  assert.ok(canBeChildOf("genus", "subtribe"));
  assert.ok(canBeChildOf("genus", "family"));
  assert.ok(canBeChildOf("genus", null));
  assert.ok(canBeChildOf("hybrid", "nothogenus"));
  assert.ok(canBeChildOf("cultivar", "hybrid"));
  assert.ok(canBeChildOf("variety", "species"));
  assert.ok(!canBeChildOf("species", null));
  assert.ok(!canBeChildOf("species", "subtribe"));
  assert.ok(!canBeChildOf("genus", "genus"));
  assert.ok(!canBeChildOf("tribe", "subtribe"));
  assert.ok(!canBeChildOf("hybrid", "species"));
});

test("nome validado conforme o nível", () => {
  assert.equal(taxonNameError("genus", "Vanda"), null);
  assert.ok(taxonNameError("genus", "vanda"));
  assert.ok(taxonNameError("genus", "Vanda coerulea"));
  assert.equal(taxonNameError("species", "cornu-cervi"), null);
  assert.ok(taxonNameError("species", "Coerulea"));
  assert.equal(taxonNameError("hybrid", "Sansai Blue"), null);
  assert.ok(taxonNameError("hybrid", "sansai blue"));
  assert.ok(taxonNameError("cultivar", "'Azul'"));
  assert.ok(taxonNameError("variety", " "));
});

test("busca ignora acento, caixa e pontuação", () => {
  assert.equal(normalizeSearch("  V. Cœrúlea  "), "v coerulea");
  assert.equal(normalizeSearch("orquídea-borboleta"), "orquidea borboleta");
  assert.equal(taxonSearchText("Vanda coerulea", ["vanda azul"]), "vanda coerulea vanda azul");
});

test("ficha herda do ancestral mais próximo que preencheu o campo", () => {
  const lineage = [
    { id: "g", tempNightMin: 16, light: "Muita luz", bloomMonths: [3, 4] },
    { id: "s", tempNightMin: 12, light: "", bloomMonths: [] },
    { id: "v" },
  ];
  const { care, sources } = inheritCare(lineage);
  assert.equal(care.tempNightMin, 12);
  assert.equal(sources.tempNightMin, "s");
  assert.equal(care.light, "Muita luz");
  assert.deepEqual(care.bloomMonths, [3, 4]);
  assert.equal(sources.bloomMonths, "g");
  assert.equal(care.tempDayMax, null);
  assert.equal(sources.tempDayMax, undefined);
  assert.ok(hasOwnCare(lineage[0]!));
  assert.ok(!hasOwnCare({ light: "", bloomMonths: [] }));
});
