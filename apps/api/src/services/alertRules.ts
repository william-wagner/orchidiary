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
