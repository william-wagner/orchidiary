import { test } from "node:test";
import assert from "node:assert/strict";
import { shareCaption, shareFileName } from "./share.ts";

test("legenda completa: nome, data, quem cultiva, legenda e assinatura", () => {
  assert.equal(
    shareCaption({
      nickname: "Aurora",
      name: "Renanthera monachica × Vanda falcata",
      date: "14.X.2026",
      grower: "Ana",
      caption: "  Primeira   flor do ano ",
    }),
    "Aurora — Renanthera monachica × Vanda falcata\nFoto de 14.X.2026 · cultivada por Ana\n“Primeira flor do ano”\n\nCultive o seu melhor. orchidiary.com",
  );
});

test("sem nome, sem quem cultiva e sem legenda, as linhas somem", () => {
  assert.equal(
    shareCaption({ nickname: "Aurora", name: null, date: "2.I.2026", grower: " ", caption: null }),
    "Aurora\nFoto de 2.I.2026\n\nCultive o seu melhor. orchidiary.com",
  );
});

test("nome do arquivo sem acento, espaço nem ponto", () => {
  assert.equal(shareFileName("Pérola do Sítio", "14.X.2026"), "perola-do-sitio-14-x-2026.jpg");
  assert.equal(shareFileName("  ", "…"), "orchidiary.jpg");
});
