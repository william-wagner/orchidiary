import { test } from "node:test";
import assert from "node:assert/strict";
import {
  type CareLineageNode,
  careParent,
  careSource,
  crossFormula,
  crossInputSchema,
  crossNameParts,
  receivedNameMatch,
  sameName,
} from "./cross.ts";
import { plantCreateSchema, plantUpdateSchema } from "./schemas.ts";
import type { TaxonNode } from "./taxonomy.ts";

const genus = (name: string): TaxonNode => ({ rank: "genus", name });
const sp = (g: string, name: string) => ({ lineage: [genus(g), { rank: "species", name } as TaxonNode] });
const monachica = sp("Renanthera", "monachica");
const falcata = sp("Vanda", "falcata");

test("fórmula semente × pólen, cada táxon no seu estilo", () => {
  assert.equal(crossFormula(monachica, falcata), "Renanthera monachica × Vanda falcata");
  assert.deepEqual(crossNameParts(monachica, falcata), [
    { text: "Renanthera monachica", italic: true },
    { text: " × ", italic: false },
    { text: "Vanda falcata", italic: true },
  ]);
  const grex = { lineage: [genus("Vanda"), { rank: "hybrid", name: "Gordon Dillon" } as TaxonNode] };
  assert.deepEqual(crossNameParts(monachica, grex), [
    { text: "Renanthera monachica", italic: true },
    { text: " × ", italic: false },
    { text: "Vanda", italic: true },
    { text: " Gordon Dillon", italic: false },
  ]);
});

test("lado desconhecido é ?, nome livre em itálico, os dois desconhecidos têm texto próprio", () => {
  assert.equal(crossFormula(falcata, null), "Vanda falcata × ?");
  assert.equal(crossFormula(null, falcata), "? × Vanda falcata");
  assert.deepEqual(crossNameParts({ text: "Vanda 'Gordon Dillon'" }, null), [
    { text: "Vanda 'Gordon Dillon'", italic: true },
    { text: " × ?", italic: false },
  ]);
  assert.equal(crossFormula(null, null), "parentais desconhecidos");
  assert.equal(crossFormula({ lineage: [genus("Vanda")] }, { lineage: [genus("Vanda")] }), "Vanda × Vanda");
});

const ids = { mon: "11111111-1111-4111-8111-111111111111", falc: "22222222-2222-4222-8222-222222222222" };

test("entrada da cruza: lado é táxon, texto ou null; a ficha só de lado do catálogo", () => {
  assert.ok(crossInputSchema.safeParse({ seed: { taxonId: ids.mon }, pollen: null, careFrom: "seed" }).success);
  assert.ok(crossInputSchema.safeParse({ seed: null, pollen: null }).success);
  assert.ok(crossInputSchema.safeParse({ seed: { text: "Ren. qualquer" }, pollen: { taxonId: ids.falc } }).success);
  assert.ok(!crossInputSchema.safeParse({ seed: { text: "Ren. qualquer" }, pollen: null, careFrom: "seed" }).success);
  assert.ok(!crossInputSchema.safeParse({ seed: null, pollen: null, careFrom: "pollen" }).success);
  assert.ok(!crossInputSchema.safeParse({ seed: { taxonId: ids.mon, text: "x" }, pollen: null }).success);
  assert.ok(!crossInputSchema.safeParse({ seed: { text: "  " }, pollen: null }).success);
});

test("a planta tem táxon ou cruza, não os dois", () => {
  const base = { nickname: "X", location: { placeId: ids.mon } };
  assert.ok(plantCreateSchema.safeParse({ ...base, taxonId: ids.mon }).success);
  assert.ok(plantCreateSchema.safeParse({ ...base, cross: { seed: null, pollen: null } }).success);
  assert.ok(!plantCreateSchema.safeParse({ ...base, taxonId: ids.mon, cross: { seed: null, pollen: null } }).success);
  assert.ok(plantUpdateSchema.safeParse({ taxonId: ids.mon, cross: null }).success);
  assert.ok(plantUpdateSchema.safeParse({ taxonId: null, cross: { seed: { taxonId: ids.falc }, pollen: null } }).success);
  assert.ok(!plantUpdateSchema.safeParse({ taxonId: ids.mon, cross: { seed: null, pollen: null } }).success);
});

test("parental da ficha: o marcado, senão o do catálogo que houver, a semente primeiro", () => {
  assert.deepEqual(careParent({ seedTaxonId: "a", pollenTaxonId: "b", careFrom: "pollen" }), { side: "pollen", taxonId: "b", choosable: true });
  assert.deepEqual(careParent({ seedTaxonId: "a", pollenTaxonId: "b", careFrom: null }), { side: "seed", taxonId: "a", choosable: true });
  assert.deepEqual(careParent({ seedTaxonId: null, pollenTaxonId: "b", careFrom: null }), { side: "pollen", taxonId: "b", choosable: false });
  // marca apontando para um lado sem táxon (ex.: ficou texto) cai no outro
  assert.deepEqual(careParent({ seedTaxonId: null, pollenTaxonId: "b", careFrom: "seed" }), { side: "pollen", taxonId: "b", choosable: false });
  assert.equal(careParent({ seedTaxonId: null, pollenTaxonId: null, careFrom: null }), null);
});

const node = (id: string, rank: CareLineageNode["rank"], hasCare = false, cross: CareLineageNode["cross"] = null): CareLineageNode => ({ id, rank, hasCare, cross });
const vanda = node("vanda", "genus", true);

test("ficha de planta com cruza vem do parental; sem parental no catálogo, não há ficha", () => {
  const cross = { seedTaxonId: "mon", pollenTaxonId: "falc", careFrom: "pollen" as const };
  assert.deepEqual(careSource({ lineage: null, cross }), { taxonId: "falc", side: "pollen", grexId: null });
  assert.equal(careSource({ lineage: null, cross: { seedTaxonId: null, pollenTaxonId: null, careFrom: null } }), null);
});

test("ficha de planta com táxon: a de sempre, salvo grex sem ficha própria com parentais", () => {
  const coerulea = node("coer", "species");
  assert.deepEqual(careSource({ lineage: [vanda, coerulea], cross: null }), { taxonId: "coer", side: null, grexId: null });
  const parents = { seedTaxonId: "coer", pollenTaxonId: "sand", careFrom: null };
  const roth = node("roth", "hybrid", false, parents);
  assert.deepEqual(careSource({ lineage: [vanda, roth], cross: null }), { taxonId: "coer", side: "seed", grexId: "roth" });
  // cultivar abaixo do grex herda os parentais do grex
  assert.deepEqual(careSource({ lineage: [vanda, roth, node("cv", "cultivar")], cross: null }), { taxonId: "coer", side: "seed", grexId: "roth" });
  // ficha própria do grex ou do cultivar passa na frente
  assert.deepEqual(careSource({ lineage: [vanda, node("roth", "hybrid", true, parents)], cross: null }), { taxonId: "roth", side: null, grexId: null });
  assert.deepEqual(careSource({ lineage: [vanda, roth, node("cv", "cultivar", true)], cross: null }), { taxonId: "cv", side: null, grexId: null });
  // grex sem parentais: herda do gênero, como hoje
  assert.deepEqual(careSource({ lineage: [vanda, node("sansai", "hybrid")], cross: null }), { taxonId: "sansai", side: null, grexId: null });
  assert.equal(careSource({ lineage: null, cross: null }), null);
});

test("mesmo nome ignora acento, caixa e aspas", () => {
  assert.ok(sameName("Vanda 'Gordon Dillon'", "Vanda Gordon Dillon"));
  assert.ok(sameName("vanda  sansai BLUE", "Vanda Sansai Blue"));
  assert.ok(!sameName("Rntda. Sunshine", "Renantanda Sunshine"));
  assert.ok(!sameName("", ""));
});

test("sugestão de troca só para um táxon igual e mais específico que o atual", () => {
  const vandaT = { id: "vanda", fullName: "Vanda", lineage: [{ id: "vanda" }] };
  const sansai = { id: "sansai", fullName: "Vanda Sansai Blue", lineage: [{ id: "vanda" }, { id: "sansai" }] };
  const catt = { id: "catt", fullName: "Cattleya", lineage: [{ id: "catt" }] };
  const hits = [vandaT, sansai, catt];
  assert.equal(receivedNameMatch("Vanda Sansai Blue", hits, null), sansai);
  assert.equal(receivedNameMatch("Vanda Sansai Blue", hits, "vanda"), sansai);
  assert.equal(receivedNameMatch("Vanda Sansai Blue", hits, "sansai"), null);
  assert.equal(receivedNameMatch("Vanda Sansai Blue", hits, "catt"), null);
  assert.equal(receivedNameMatch("Rntda. Sunshine", hits, null), null);
  assert.equal(receivedNameMatch(null, hits, null), null);
});
