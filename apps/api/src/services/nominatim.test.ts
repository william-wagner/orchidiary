import { test } from "node:test";
import assert from "node:assert/strict";
import { parseNominatim } from "./nominatim.ts";

test("cidade brasileira: sigla vem do ISO 3166-2", () => {
  const l = parseNominatim({
    address: { city: "Belo Horizonte", state: "Minas Gerais", "ISO3166-2-lvl4": "BR-MG", country: "Brasil", country_code: "br" },
  });
  assert.deepEqual(l, { city: "Belo Horizonte", state: "Minas Gerais", stateCode: "MG", country: "Brasil", countryCode: "BR" });
});

test("cidade pequena cai para town/village/municipality", () => {
  assert.equal(parseNominatim({ address: { town: "Lagoa Santa", country: "Brasil" } })?.city, "Lagoa Santa");
  assert.equal(parseNominatim({ address: { village: "Mendes", country: "Brasil" } })?.city, "Mendes");
  assert.equal(parseNominatim({ address: { municipality: "Sintra", country: "Portugal" } })?.city, "Sintra");
});

test("sigla ignora códigos que não são curtos", () => {
  const l = parseNominatim({ address: { city: "Paris", state: "Île-de-France", "ISO3166-2-lvl4": "FR-IDF", country: "França" } });
  assert.equal(l?.stateCode, "IDF");
  assert.equal(parseNominatim({ address: { city: "X", "ISO3166-2-lvl4": "xx" } })?.stateCode, null);
});

test("sem endereço útil devolve null", () => {
  assert.equal(parseNominatim(null), null);
  assert.equal(parseNominatim({}), null);
  assert.equal(parseNominatim({ address: { road: "Rua A" } }), null);
});
