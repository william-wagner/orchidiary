import { addDays, daysBetween, type IsoDate, localHour } from "./dates.ts";
import type { EventType } from "./enums.ts";
import { type LocationPeriod, periodAt } from "./locations.ts";

/**
 * Gráfico "Clima e ocorrências" da ficha da planta: janela de dias, agregação por semana
 * e a fita de ocorrências. Ver docs/estudos/clima-e-ocorrencias.md.
 */
export const CHART_WINDOWS = [30, 90, 180, 360] as const;
/** Janela do gráfico em dias, ou "all" (todo o histórico da planta) */
export type ChartWindow = (typeof CHART_WINDOWS)[number] | "all";
export const CHART_WINDOW_OPTIONS: readonly ChartWindow[] = [...CHART_WINDOWS, "all"];
export const CHART_DEFAULT_WINDOW: ChartWindow = 90;
/** Acima disso, a linha do gráfico agrega por semana (as contas continuam contando dias) */
export const CHART_WEEKLY_ABOVE_DAYS = 120;
/** Pontos da fita mais próximos que isso no eixo viram um ponto só (alvos de toque sem se encostar) */
export const OCCURRENCE_CLUSTER_PX = 17;

/** Lê `?days=`: ausente é o padrão; valor fora da lista é null (a rota responde 400). */
export function parseChartWindow(value: string | null | undefined): ChartWindow | null {
  if (value == null || value === "") return CHART_DEFAULT_WINDOW;
  if (value === "all") return "all";
  const n = Number(value);
  return (CHART_WINDOWS as readonly number[]).includes(n) ? (n as ChartWindow) : null;
}

/**
 * Dias do gráfico até `end`, inclusive. "Tudo" começa no primeiro dia da planta no diário
 * (nunca antes); as janelas fixas não são cortadas: dias antes da planta ficam sem clima.
 */
export function chartRange(window: ChartWindow, end: IsoDate, historyStart: IsoDate | null): { from: IsoDate; to: IsoDate } {
  if (window === "all") return { from: historyStart && historyStart < end ? historyStart : end, to: end };
  return { from: addDays(end, -(window - 1)), to: end };
}

export const isWeeklyChart = (from: IsoDate, to: IsoDate) => daysBetween(from, to) + 1 > CHART_WEEKLY_ABOVE_DAYS;

export interface ChartWeatherDay {
  date: IsoDate;
  tempMin: number | null;
  tempMax: number | null;
  humidityMean: number | null;
}

export interface ChartWeek extends ChartWeatherDay {
  /** Domingo que fecha a semana (`date` é a segunda que abre) */
  to: IsoDate;
}

/** Segunda-feira da semana da data. */
export function weekStart(date: IsoDate): IsoDate {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = domingo
  return addDays(date, -((weekday + 6) % 7));
}

const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

/**
 * Linha agregada por semana (segunda a domingo): a mínima mais baixa, a máxima mais alta
 * e a umidade média. Semana sem nenhum dado fica de fora.
 */
export function weeklySeries(days: readonly ChartWeatherDay[]): ChartWeek[] {
  const weeks = new Map<IsoDate, ChartWeatherDay[]>();
  for (const d of days) {
    const key = weekStart(d.date);
    weeks.set(key, [...(weeks.get(key) ?? []), d]);
  }
  return [...weeks.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([date, list]) => {
      const mins = list.flatMap((d) => (d.tempMin == null ? [] : [d.tempMin]));
      const maxs = list.flatMap((d) => (d.tempMax == null ? [] : [d.tempMax]));
      const hums = list.flatMap((d) => (d.humidityMean == null ? [] : [d.humidityMean]));
      if (!mins.length && !maxs.length && !hums.length) return [];
      return [
        {
          date,
          to: addDays(date, 6),
          tempMin: mins.length ? Math.min(...mins) : null,
          tempMax: maxs.length ? Math.max(...maxs) : null,
          humidityMean: avg(hums),
        },
      ];
    });
}

// ─── Fita de ocorrências ─────────────────────────────────────────────────────

export const OCCURRENCE_LAYERS = ["milestones", "photos", "health", "care", "notes"] as const;
export type OccurrenceLayer = (typeof OCCURRENCE_LAYERS)[number];
/** Ligadas na primeira vez; a escolha depois fica lembrada no aparelho */
export const DEFAULT_OCCURRENCE_LAYERS: readonly OccurrenceLayer[] = ["milestones", "photos", "health"];
export const OCCURRENCE_LAYER_LABEL: Record<OccurrenceLayer, string> = {
  milestones: "Marcos",
  photos: "Fotos",
  health: "Saúde",
  care: "Manejo",
  notes: "Notas",
};

/** Camada de cada tipo de evento na fita */
export const EVENT_LAYER: Record<EventType, OccurrenceLayer> = {
  bloom_start: "milestones",
  bloom_end: "milestones",
  new_growth: "milestones",
  new_root: "milestones",
  keiki: "milestones",
  repotting: "milestones",
  moved: "milestones",
  pest: "health",
  disease: "health",
  treatment: "health",
  watering: "care",
  fertilizing: "care",
  note: "notes",
};

/** Medição manual entre 19h e 8h vai para o painel das noites; o resto, para o dos dias. */
export const NIGHT_FROM_HOUR = 19;
export const DAY_FROM_HOUR = 8;
export function readingPanel(measuredAt: Date, timeZone: string): "night" | "day" {
  const hour = localHour(measuredAt, timeZone);
  return hour >= NIGHT_FROM_HOUR || hour < DAY_FROM_HOUR ? "night" : "day";
}

export type Occurrence =
  | {
      kind: "photo";
      id: string;
      at: Date;
      caption: string | null;
      width: number | null;
      height: number | null;
      placeName: string | null;
    }
  | {
      kind: "event";
      id: string;
      at: Date;
      type: EventType;
      notes: string | null;
      data: Record<string, unknown>;
      placeName: string | null;
    }
  | {
      kind: "reading";
      id: string;
      at: Date;
      temperature: number | null;
      humidity: number | null;
      notes: string | null;
      placeName: string | null;
    };

const KIND_ORDER: Record<Occurrence["kind"], number> = { photo: 0, event: 1, reading: 2 };

/**
 * Ocorrências da planta em ordem crescente, para a fita e o feed. Eventos de lote ficam
 * de fora (só o livro de registro mostra). O local é o do período vigente NA DATA de cada
 * ocorrência, nunca o atual.
 */
export function buildOccurrences(input: {
  photos: ReadonlyArray<{ id: string; takenAt: Date; caption: string | null; width: number | null; height: number | null }>;
  events: ReadonlyArray<{ id: string; occurredAt: Date; type: EventType; notes: string | null; data: Record<string, unknown>; batchId: string | null }>;
  readings: ReadonlyArray<{ id: string; measuredAt: Date; temperature: number | null; humidity: number | null; notes: string | null }>;
  periods: Array<LocationPeriod & { label: string | null }>;
}): Occurrence[] {
  const placeAt = (at: Date) => periodAt(input.periods, at)?.label ?? null;
  const items: Occurrence[] = [
    ...input.photos.map((p) => ({
      kind: "photo" as const,
      id: p.id,
      at: p.takenAt,
      caption: p.caption,
      width: p.width,
      height: p.height,
      placeName: placeAt(p.takenAt),
    })),
    ...input.events
      .filter((e) => !e.batchId)
      .map((e) => ({ kind: "event" as const, id: e.id, at: e.occurredAt, type: e.type, notes: e.notes, data: e.data, placeName: placeAt(e.occurredAt) })),
    ...input.readings.map((r) => ({
      kind: "reading" as const,
      id: r.id,
      at: r.measuredAt,
      temperature: r.temperature,
      humidity: r.humidity,
      notes: r.notes,
      placeName: placeAt(r.measuredAt),
    })),
  ];
  return items.sort((a, b) => a.at.getTime() - b.at.getTime() || KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
}
