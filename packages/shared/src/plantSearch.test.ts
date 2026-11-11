import { test } from "node:test";
import assert from "node:assert/strict";
import { matchesSearch, plantSearchText, type SearchablePlant, type SearchableTaxon } from "./plantSearch.ts";

const orchidaceae = { fullName: "Orchidaceae" };
const taxon = (fullName: string, genus: string, commonNames: string[] = []): SearchableTaxon => ({
  fullName,
  commonNames,
  lineage: [orchidaceae, { fullName: genus }, { fullName }],
});
const base: SearchablePlant = { nickname: "", accessionNumber: null, receivedName: null, taxon: null, cross: null, currentLocation: null };

const coerulea: SearchablePlant = {
  ...base,
  nickname: "Azulzinha da varanda",
  accessionNumber: 7,
  receivedName: "Vanda azul",
  taxon: taxon("Vanda coerulea", "Vanda", ["orquídea-azul"]),
  currentLocation: { placeName: "Varanda dos fundos" },
};
const cruza: SearchablePlant = {
  ...base,
  nickname: "Laranjinha",
  accessionNumber: 17,
  cross: { seed: { taxon: taxon("Renanthera monachica", "Renanthera") }, pollen: { taxon: taxon("Vanda falcata", "Vanda") } },
};
const cruzaLivre: SearchablePlant = { ...base, nickname: "Sementinha", cross: { seed: { text: "Cattleya da vizinha" }, pollen: null } };
const search = (p: SearchablePlant, q: string) => matchesSearch(plantSearchText(p), q);

test("busca pelo apelido, etiqueta e lugar, sem acento nem caixa", () => {
  assert.ok(search(coerulea, "azulzinha"));
  assert.ok(search(coerulea, "VANDA AZUL"));
  assert.ok(search(coerulea, "fundos"));
  assert.ok(search(coerulea, "orquidea azul"));
});

test("busca pelo táxon e pelos níveis acima dele", () => {
  assert.ok(search(coerulea, "coerulea"));
  assert.ok(search(coerulea, "vanda"));
  assert.ok(search(coerulea, "orchidaceae"));
  assert.ok(!search(coerulea, "cattleya"));
});

test("cruza: acha pelos dois parentais e pelos gêneros deles", () => {
  assert.ok(search(cruza, "falcata"));
  assert.ok(search(cruza, "monachica"));
  assert.ok(search(cruza, "Vanda"));
  assert.ok(search(cruza, "renanthera vanda"));
  assert.ok(search(cruzaLivre, "vizinha"));
});

test("nº de tombo: com ou sem zeros, sem pegar outros números", () => {
  assert.ok(search(coerulea, "7"));
  assert.ok(search(coerulea, "0007"));
  assert.ok(!search(cruza, "7"));
  assert.ok(search(cruza, "17"));
});

test("todas as palavras precisam casar, como começo de palavra", () => {
  assert.ok(search(cruza, "ren falc"));
  assert.ok(!search(cruza, "falcata coerulea"));
  assert.ok(!search(coerulea, "erulea"));
  assert.ok(search(coerulea, "  "));
});
