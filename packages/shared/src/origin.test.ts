import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { countryList, normalizeOrigin, ORIGIN_COUNTRIES, originError, originLabel, resolveOrigin } from "./origin.ts";

const none = { originKind: null, originCountryCodes: [] };

test("a origem vem do táxon mais específico que a preencheu", () => {
  const lineage = [none, { originKind: "country" as const, originCountryCodes: ["BR"] }, none];
  assert.deepEqual(resolveOrigin(lineage), { kind: "country", countries: [{ code: "BR", name: "Brasil" }] });
  assert.deepEqual(resolveOrigin([...lineage, { originKind: "country", originCountryCodes: ["CO", "EC"] }]), {
    kind: "country",
    countries: [
      { code: "CO", name: "Colômbia" },
      { code: "EC", name: "Equador" },
    ],
  });
});

test("cruzamento herdado por cultivar; sem informação é desconhecida", () => {
  assert.deepEqual(resolveOrigin([{ originKind: "cross", originCountryCodes: [] }, {}]), { kind: "cross" });
  assert.deepEqual(resolveOrigin([{}, {}]), { kind: "unknown" });
  assert.deepEqual(resolveOrigin([]), { kind: "unknown" });
});

test("códigos fora da lista são ignorados na leitura, mantendo a ordem dos outros", () => {
  assert.deepEqual(resolveOrigin([{ originKind: "country", originCountryCodes: ["ZZ"] }]), { kind: "unknown" });
  assert.deepEqual(resolveOrigin([{ originKind: "country", originCountryCodes: ["ZZ", "TH", "CN"] }]), {
    kind: "country",
    countries: [
      { code: "TH", name: "Tailândia" },
      { code: "CN", name: "China" },
    ],
  });
});

test("híbrido e gênero híbrido são cruzamento mesmo sem informar", () => {
  assert.deepEqual(normalizeOrigin("hybrid", {}), { originKind: "cross", originCountryCodes: [] });
  assert.deepEqual(normalizeOrigin("nothogenus", { originKind: null }), { originKind: "cross", originCountryCodes: [] });
  assert.deepEqual(normalizeOrigin("species", {}), none);
  assert.deepEqual(normalizeOrigin("species", { originKind: "cross" }), { originKind: "cross", originCountryCodes: [] });
});

test("normalizar descarta país inválido, repetido e país solto", () => {
  assert.deepEqual(normalizeOrigin("species", { originKind: "country", originCountryCodes: ["BR", "ZZ", "BR", "PY"] }), {
    originKind: "country",
    originCountryCodes: ["BR", "PY"],
  });
  assert.deepEqual(normalizeOrigin("species", { originKind: "country", originCountryCodes: ["ZZ"] }), none);
  assert.deepEqual(normalizeOrigin("species", { originKind: null, originCountryCodes: ["BR"] }), none);
});

test("originError explica o que está errado", () => {
  assert.equal(originError({ originKind: "country", originCountryCodes: ["BR", "PY"] }), null);
  assert.ok(originError({ originKind: "country", originCountryCodes: [] }));
  assert.ok(originError({ originKind: "country", originCountryCodes: ["BR", "ZZ"] }));
  assert.ok(originError({ originKind: "cross", originCountryCodes: ["BR"] }));
  assert.equal(originError({}), null);
});

test("a lista de países tem códigos de duas letras maiúsculas e nomes", () => {
  for (const [code, name] of Object.entries(ORIGIN_COUNTRIES)) {
    assert.match(code, /^[A-Z]{2}$/);
    assert.ok(name.length > 2);
  }
});

test("rótulos de acessibilidade", () => {
  const br = { code: "BR" as const, name: "Brasil" };
  const py = { code: "PY" as const, name: "Paraguai" };
  const ar = { code: "AR" as const, name: "Argentina" };
  assert.equal(countryList([br, py, ar]), "Brasil, Paraguai e Argentina");
  assert.equal(originLabel({ kind: "country", countries: [br] }), "Origem: Brasil");
  assert.equal(originLabel({ kind: "country", countries: [br, py] }), "Origem: Brasil e Paraguai");
  assert.equal(originLabel({ kind: "cross" }), "Cruzamento, sem origem definida");
  assert.equal(originLabel({ kind: "unknown" }), "Origem desconhecida");
});

test("o web embute a bandeira de cada país da lista (e só deles)", () => {
  const source = readFileSync(new URL("../../../apps/web/src/components/OriginFlag.tsx", import.meta.url), "utf8");
  const embedded = /3x2\/\{([A-Z,]+)\}\.svg/.exec(source)?.[1]?.split(",");
  assert.deepEqual([...(embedded ?? [])].sort(), Object.keys(ORIGIN_COUNTRIES).sort());
});
