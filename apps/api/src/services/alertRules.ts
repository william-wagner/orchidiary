import { COMFORT_DAY_NOUN, type ComfortChange, herbariumDate } from "@orchidiary/shared";
import { escapeHtml } from "../lib/html.ts";

export interface SpeciesRanges {
  tempNightMin: number | null;
  tempDayMax: number | null;
}

export interface ForecastDay {
  date: string;
  tempMin: number | null;
  tempMax: number | null;
}

export interface AlertDraft {
  kind: "cold" | "heat";
  date: string;
  message: string;
}

/** Margem para avisar um pouco antes de atingir o limite da espécie (°C). */
const MARGIN = 1;

/**
 * Compara a previsão de amanhã com as faixas da ficha de cultivo.
 * Só vale para plantas outdoor: o clima da API é o externo.
 */
export function evaluateForecast(plantName: string, ranges: SpeciesRanges, day: ForecastDay): AlertDraft[] {
  const out: AlertDraft[] = [];
  const name = escapeHtml(plantName);
  if (ranges.tempNightMin != null && day.tempMin != null && day.tempMin <= ranges.tempNightMin + MARGIN) {
    out.push({
      kind: "cold",
      date: day.date,
      message: `🥶 <b>${name}</b>: mínima prevista de ${day.tempMin}°C em ${day.date} (a espécie tolera a partir de ${ranges.tempNightMin}°C). Considere abrigar.`,
    });
  }
  if (ranges.tempDayMax != null && day.tempMax != null && day.tempMax >= ranges.tempDayMax - MARGIN) {
    out.push({
      kind: "heat",
      date: day.date,
      message: `🥵 <b>${name}</b>: máxima prevista de ${day.tempMax}°C em ${day.date} (limite da espécie: ${ranges.tempDayMax}°C). Reforce sombra e umidade.`,
    });
  }
  return out;
}

export interface DigestPlant {
  /** Nome científico completo do táxon */
  taxonName: string;
  nickname: string;
  /** Dentro de casa: o clima comparado é o de fora, só referência */
  indoor?: boolean;
  changes: ComfortChange[];
}

const shortDate = (d: string) => herbariumDate(d, "UTC").replace(/\.\d{4}$/, "");

/**
 * Resumo quinzenal do índice de conforto: só quem passou a sair da faixa e quem voltou.
 * Devolve null quando nada mudou (nenhuma mensagem é enviada).
 */
export function formatComfortDigest(a: {
  from: string;
  to: string;
  plants: DigestPlant[];
  unchanged: number;
  silenced: number;
  link?: string;
}): string | null {
  const changed = a.plants.filter((p) => p.changes.length);
  if (!changed.length) return null;
  const who = (p: DigestPlant) =>
    `<i>${escapeHtml(p.taxonName)}</i> (${escapeHtml(p.nickname)}${p.indoor ? ", dentro de casa, pelo clima de fora" : ""})`;
  const lines = [`🌿 <b>Conforto da coleção</b> · ${shortDate(a.from)} a ${herbariumDate(a.to, "UTC")}`];
  const entered = changed.flatMap((p) => p.changes.filter((c) => c.kind === "entered").map((c) => ({ p, c })));
  const left = changed.flatMap((p) => p.changes.filter((c) => c.kind === "left").map((c) => ({ p, c })));
  if (entered.length) {
    lines.push("", "<b>Passaram a sair da faixa</b>");
    for (const { p, c } of entered) {
      lines.push(
        `• ${who(p)}: ${c.label} em ${c.current.count} de ${c.current.total} ${COMFORT_DAY_NOUN[c.dimension]} (na quinzena anterior, ${c.previous.count})`,
      );
    }
  }
  if (left.length) {
    lines.push("", "<b>Voltaram para a faixa</b>");
    for (const { p, c } of left) lines.push(`• ${who(p)}: sem ${c.label} (antes, ${c.previous.count} de ${c.previous.total})`);
  }
  const tail = [`Sem mudança: ${a.unchanged} ${a.unchanged === 1 ? "planta" : "plantas"}.`];
  if (a.silenced) tail.push(`${a.silenced} ${a.silenced === 1 ? "aviso silenciado" : "avisos silenciados"}.`);
  lines.push("", tail.join(" "));
  if (a.link) lines.push(`<a href="${escapeHtml(a.link)}">Ver as plantas fora da faixa</a>`);
  return lines.join("\n");
}
