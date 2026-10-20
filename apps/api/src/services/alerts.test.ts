import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateForecast, formatComfortDigest } from "./alertRules.ts";

const walkeriana = { tempNightMin: 10, tempDayMax: 35 };

test("avisa frio quando a mínima prevista chega perto do limite", () => {
  const a = evaluateForecast("Walkeriana <azul>", walkeriana, { date: "2026-06-20", tempMin: 10.8, tempMax: 22 });
  assert.equal(a.length, 1);
  assert.equal(a[0]!.kind, "cold");
  assert.ok(a[0]!.message.includes("&lt;azul&gt;"), "nome é escapado para HTML do Telegram");
});

test("avisa calor e não avisa em dia ameno", () => {
  assert.equal(evaluateForecast("X", walkeriana, { date: "2026-01-10", tempMin: 20, tempMax: 34.5 })[0]?.kind, "heat");
  assert.deepEqual(evaluateForecast("X", walkeriana, { date: "2026-04-10", tempMin: 15, tempMax: 27 }), []);
  assert.deepEqual(evaluateForecast("X", { tempNightMin: null, tempDayMax: null }, { date: "d", tempMin: -5, tempMax: 45 }), []);
});

const attention = (direction: -1 | 0 | 1, count: number, total = 14) => ({ direction, count, total }) as const;

test("resumo de conforto: lista quem entrou e quem voltou, com nome escapado", () => {
  const msg = formatComfortDigest({
    from: "2026-10-05",
    to: "2026-10-18",
    plants: [
      {
        taxonName: "Vanda tricolor",
        nickname: "Vanda <varanda>",
        changes: [{ dimension: "night", kind: "entered", direction: -1, label: "noites frias", current: attention(-1, 7), previous: attention(0, 0) }],
      },
      {
        taxonName: "Dendrobium nobile",
        nickname: "Nobile",
        changes: [{ dimension: "night", kind: "left", direction: 1, label: "noites quentes", current: attention(0, 1), previous: attention(1, 12) }],
      },
    ],
    unchanged: 1,
    silenced: 2,
    link: "https://exemplo/?conforto=fora",
  })!;
  assert.ok(msg.includes("5.X a 18.X.2026"));
  assert.ok(msg.includes("<i>Vanda tricolor</i> (Vanda &lt;varanda&gt;): noites frias em 7 de 14 noites (na quinzena anterior, 0)"));
  assert.ok(msg.includes("<b>Voltaram para a faixa</b>\n• <i>Dendrobium nobile</i> (Nobile): sem noites quentes (antes, 12 de 14)"));
  assert.ok(msg.includes("Sem mudança: 1 planta. 2 avisos silenciados."));
});

test("resumo de conforto: planta dentro de casa vem marcada como referência do clima de fora", () => {
  const msg = formatComfortDigest({
    from: "2026-10-05",
    to: "2026-10-18",
    plants: [
      {
        taxonName: "Phalaenopsis",
        nickname: "Raiz",
        indoor: true,
        changes: [{ dimension: "day", kind: "entered", direction: 1, label: "dias quentes", current: attention(1, 4), previous: attention(0, 0) }],
      },
    ],
    unchanged: 0,
    silenced: 0,
  })!;
  assert.ok(msg.includes("<i>Phalaenopsis</i> (Raiz, dentro de casa, pelo clima de fora): dias quentes em 4 de 14 dias"));
});

test("resumo de conforto: nada mudou, nenhuma mensagem", () => {
  assert.equal(formatComfortDigest({ from: "2026-10-05", to: "2026-10-18", plants: [{ taxonName: "X", nickname: "Y", changes: [] }], unchanged: 1, silenced: 0 }), null);
});
