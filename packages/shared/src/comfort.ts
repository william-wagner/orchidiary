import { addDays, dateRange, daysBetween, type IsoDate } from "./dates.ts";
import type { Care } from "./taxonomy.ts";

/**
 * Índice de conforto: o clima diário do local contra as faixas da ficha.
 * Três dimensões, cada uma com a métrica diária que conversa com a faixa:
 * noites (mínima do dia), dias (máxima) e umidade (média).
 */
export const COMFORT_DIMENSIONS = ["night", "day", "humidity"] as const;
export type ComfortDimension = (typeof COMFORT_DIMENSIONS)[number];

export type ComfortState = "inside" | "near" | "outside";
/** -1 abaixo da faixa, 1 acima, 0 dentro */
export type ComfortDirection = -1 | 0 | 1;

export interface ComfortRange {
  min: number | null;
  max: number | null;
}

/** Quanto além da faixa ainda conta como "perto" (°C nas temperaturas, pontos percentuais na umidade). */
export const COMFORT_MARGIN: Record<ComfortDimension, number> = { night: 1.5, day: 1.5, humidity: 5 };
/** Dias fora da faixa, no mesmo sentido, para uma janela ficar "em atenção". */
export const COMFORT_ATTENTION_DAYS = 3;
/** Janela do selo do card */
export const COMFORT_CARD_DAYS = 7;
/** Janela do resumo: compara a quinzena que fechou com a anterior */
export const COMFORT_DIGEST_DAYS = 14;
/** Janela da seção Conforto da ficha */
export const COMFORT_DETAIL_DAYS = 30;
/** Segunda-feira de referência: o resumo fecha a cada 14 dias contados a partir dela */
export const COMFORT_DIGEST_ANCHOR: IsoDate = "2026-01-05";

export const COMFORT_DIMENSION_LABEL: Record<ComfortDimension, string> = { night: "Noites", day: "Dias", humidity: "Umidade" };

/** Nome do problema, como aparece no selo e no resumo */
export const COMFORT_LABEL: Record<ComfortDimension, Record<-1 | 1, string>> = {
  night: { [-1]: "noites frias", 1: "noites quentes" },
  day: { [-1]: "dias frios", 1: "dias quentes" },
  humidity: { [-1]: "ar seco", 1: "ar úmido demais" },
};

/** "em 6 de 14 noites" */
export const COMFORT_DAY_NOUN: Record<ComfortDimension, string> = { night: "noites", day: "dias", humidity: "dias" };

export type ComfortRanges = Record<ComfortDimension, ComfortRange | null>;

/** Faixas da ficha por dimensão; null quando a ficha não informa nenhum dos limites. */
export function comfortRanges(
  care: Pick<Care, "tempNightMin" | "tempNightMax" | "tempDayMin" | "tempDayMax" | "humidityMin" | "humidityMax">,
): ComfortRanges {
  const range = (min: number | null, max: number | null) => (min == null && max == null ? null : { min, max });
  return {
    night: range(care.tempNightMin, care.tempNightMax),
    day: range(care.tempDayMin, care.tempDayMax),
    humidity: range(care.humidityMin, care.humidityMax),
  };
}

export const hasComfortRanges = (r: ComfortRanges) => COMFORT_DIMENSIONS.some((d) => r[d] != null);

export interface ComfortWeatherDay {
  date: IsoDate;
  tempMin: number | null;
  tempMax: number | null;
  humidityMean: number | null;
}

const VALUE_OF: Record<ComfortDimension, (d: ComfortWeatherDay) => number | null> = {
  night: (d) => d.tempMin,
  day: (d) => d.tempMax,
  humidity: (d) => d.humidityMean,
};

export interface ComfortDay {
  date: IsoDate;
  /** null quando não há clima para o dia (antes da planta chegar ao local, ou coleta falhou) */
  value: number | null;
  state: ComfortState | null;
  direction: ComfortDirection;
  /** Quanto além da faixa, sempre positivo; 0 dentro */
  diff: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function classifyComfort(value: number, range: ComfortRange, margin: number) {
  const direction: ComfortDirection = range.min != null && value < range.min ? -1 : range.max != null && value > range.max ? 1 : 0;
  const diff = direction < 0 ? round1(range.min! - value) : direction > 0 ? round1(value - range.max!) : 0;
  const state: ComfortState = diff === 0 ? "inside" : diff <= margin ? "near" : "outside";
  return { state, direction, diff };
}

/** Um dia por data de `from` a `to`, inclusive, classificado contra a faixa. */
export function comfortDays(
  dimension: ComfortDimension,
  range: ComfortRange,
  weather: readonly ComfortWeatherDay[],
  from: IsoDate,
  to: IsoDate,
): ComfortDay[] {
  const byDate = new Map(weather.map((w) => [w.date, VALUE_OF[dimension](w)]));
  return dateRange(from, to).map((date) => {
    const value = byDate.get(date) ?? null;
    if (value == null) return { date, value: null, state: null, direction: 0, diff: 0 };
    return { date, value, ...classifyComfort(value, range, COMFORT_MARGIN[dimension]) };
  });
}

export interface ComfortAttention {
  /** Sentido com dias fora suficientes; 0 quando a janela está tranquila */
  direction: ComfortDirection;
  /** Dias fora no sentido que mais apareceu */
  count: number;
  /** Dias com clima na janela */
  total: number;
}

/** A janela está "em atenção" quando teve COMFORT_ATTENTION_DAYS ou mais dias fora no mesmo sentido. */
export function attentionOf(days: readonly ComfortDay[]): ComfortAttention {
  let below = 0;
  let above = 0;
  for (const d of days) if (d.state === "outside") d.direction < 0 ? below++ : above++;
  const total = days.filter((d) => d.value != null).length;
  const count = Math.max(below, above);
  if (count < COMFORT_ATTENTION_DAYS) return { direction: 0, count, total };
  return { direction: below >= above ? -1 : 1, count, total };
}

export interface ComfortFlag {
  dimension: ComfortDimension;
  direction: -1 | 1;
  label: string;
  count: number;
}

/**
 * Selos do card: dimensões em atenção nos últimos COMFORT_CARD_DAYS dias até `end`,
 * a pior primeiro. Dimensões silenciadas ficam de fora.
 */
export function comfortFlags(
  ranges: ComfortRanges,
  weather: readonly ComfortWeatherDay[],
  end: IsoDate,
  silenced: ReadonlySet<ComfortDimension> = new Set(),
): ComfortFlag[] {
  const from = addDays(end, -(COMFORT_CARD_DAYS - 1));
  const out: ComfortFlag[] = [];
  for (const dimension of COMFORT_DIMENSIONS) {
    const range = ranges[dimension];
    if (!range || silenced.has(dimension)) continue;
    const a = attentionOf(comfortDays(dimension, range, weather, from, end));
    if (a.direction) out.push({ dimension, direction: a.direction, label: COMFORT_LABEL[dimension][a.direction], count: a.count });
  }
  return out.sort((x, y) => y.count - x.count);
}

/** Último fechamento de quinzena do resumo, em `today` ou antes. */
export function digestBoundary(today: IsoDate, anchor: IsoDate = COMFORT_DIGEST_ANCHOR): IsoDate {
  const n = daysBetween(anchor, today);
  const mod = ((n % COMFORT_DIGEST_DAYS) + COMFORT_DIGEST_DAYS) % COMFORT_DIGEST_DAYS;
  return addDays(today, -mod);
}

/** A quinzena que fecha em `boundary` (sem incluí-lo) e a anterior a ela. */
export function digestWindows(boundary: IsoDate) {
  return {
    current: { from: addDays(boundary, -COMFORT_DIGEST_DAYS), to: addDays(boundary, -1) },
    previous: { from: addDays(boundary, -2 * COMFORT_DIGEST_DAYS), to: addDays(boundary, -COMFORT_DIGEST_DAYS - 1) },
  };
}

export interface ComfortChange {
  dimension: ComfortDimension;
  /** "entered": passou a sair da faixa; "left": voltou para a faixa */
  kind: "entered" | "left";
  /** Sentido do problema (o novo, ao entrar; o que acabou, ao sair) */
  direction: -1 | 1;
  label: string;
  current: ComfortAttention;
  previous: ComfortAttention;
}

/**
 * O que mudou de uma quinzena para a outra. Quem continua igual não aparece:
 * o resumo não repete o que o usuário já sabe.
 */
export function comfortChanges(
  ranges: ComfortRanges,
  weather: readonly ComfortWeatherDay[],
  boundary: IsoDate,
  silenced: ReadonlySet<ComfortDimension> = new Set(),
): ComfortChange[] {
  const w = digestWindows(boundary);
  const out: ComfortChange[] = [];
  for (const dimension of COMFORT_DIMENSIONS) {
    const range = ranges[dimension];
    if (!range || silenced.has(dimension)) continue;
    const current = attentionOf(comfortDays(dimension, range, weather, w.current.from, w.current.to));
    const previous = attentionOf(comfortDays(dimension, range, weather, w.previous.from, w.previous.to));
    if (current.direction && current.direction !== previous.direction) {
      out.push({ dimension, kind: "entered", direction: current.direction, label: COMFORT_LABEL[dimension][current.direction], current, previous });
    } else if (!current.direction && previous.direction) {
      out.push({ dimension, kind: "left", direction: previous.direction, label: COMFORT_LABEL[dimension][previous.direction], current, previous });
    }
  }
  return out;
}
