import { addDays, toLocalDate, type IsoDate } from "./dates.ts";

/**
 * Histórico de localização de uma planta.
 *
 * Regra central do projeto: mudar a planta de lugar NUNCA altera o passado.
 * Cada mudança fecha o período atual (validTo) e abre um novo (validFrom).
 * Clima, fotos e eventos antigos continuam ligados ao local onde a planta
 * estava naquele momento — ela pode ter ido de uma cidade para outra.
 */
/** Qualquer intervalo com começo e, talvez, fim. */
export interface DateSpan {
  validFrom: Date;
  /** null = ainda aberto */
  validTo: Date | null;
}

export interface LocationPeriod extends DateSpan {
  id: string;
}

export class RetroactiveMoveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetroactiveMoveError";
  }
}

export function currentPeriod<T extends LocationPeriod>(periods: T[]): T | undefined {
  return periods.find((p) => p.validTo === null);
}

/** Período em que a planta estava num dado instante. */
export function periodAt<T extends LocationPeriod>(periods: T[], instant: Date): T | undefined {
  const t = instant.getTime();
  return periods.find((p) => p.validFrom.getTime() <= t && (p.validTo === null || t < p.validTo.getTime()));
}

/**
 * Valida uma mudança de local e diz qual período fechar.
 * A nova data precisa ser posterior ao início do período atual: não se insere
 * nada no meio do histórico nem se reescreve um local antigo.
 */
export function planMove<T extends LocationPeriod>(
  periods: T[],
  movedAt: Date,
  now: Date = new Date(),
): { close: T | undefined; validFrom: Date } {
  if (movedAt.getTime() > now.getTime() + 60_000) {
    throw new RetroactiveMoveError("A data da mudança não pode estar no futuro.");
  }
  const current = currentPeriod(periods);
  if (current && movedAt.getTime() <= current.validFrom.getTime()) {
    throw new RetroactiveMoveError(
      "A mudança precisa ser posterior ao início do local atual. O histórico de locais não é alterado retroativamente.",
    );
  }
  return { close: current, validFrom: movedAt };
}

/**
 * De onde vem o clima de um trecho da vida da planta.
 * - `place`: o período de localização do LUGAR (uma série para todas as plantas dele);
 * - `plant`: o período da própria planta, quando ela não está em lugar nenhum.
 */
export type ClimateSource = { kind: "place"; id: string } | { kind: "plant"; id: string };

export const climateSourceKey = (s: ClimateSource) => `${s.kind}:${s.id}`;

/** Trecho contínuo em que o clima da planta vem de uma mesma fonte. */
export interface ClimateSegment {
  source: ClimateSource;
  validFrom: Date;
  /** null = ainda aberto */
  validTo: Date | null;
}

const maxDate = (a: Date, b: Date) => (a.getTime() >= b.getTime() ? a : b);
const minEnd = (a: Date | null, b: Date | null) => (a === null ? b : b === null ? a : a.getTime() <= b.getTime() ? a : b);

/**
 * Quebra o histórico da planta em trechos por fonte de clima.
 *
 * Período sem lugar → a própria planta é a fonte. Período num lugar → cada período de
 * localização daquele lugar que se cruza com ele vira um trecho, então a planta acompanha
 * as mudanças do lugar sem que nada seja copiado nem reescrito. Os trechos saem em ordem.
 */
export function climateSegments<P extends LocationPeriod & { placeId: string | null }, L extends LocationPeriod & { placeId: string }>(
  periods: P[],
  placePeriods: L[],
): ClimateSegment[] {
  const out: ClimateSegment[] = [];
  for (const period of periods) {
    if (!period.placeId) {
      out.push({ source: { kind: "plant", id: period.id }, validFrom: period.validFrom, validTo: period.validTo });
      continue;
    }
    for (const place of placePeriods) {
      if (place.placeId !== period.placeId) continue;
      const validFrom = maxDate(period.validFrom, place.validFrom);
      const validTo = minEnd(period.validTo, place.validTo);
      if (validTo !== null && validTo.getTime() <= validFrom.getTime()) continue;
      out.push({ source: { kind: "place", id: place.id }, validFrom, validTo });
    }
  }
  return out.sort((a, b) => a.validFrom.getTime() - b.validFrom.getTime());
}

/**
 * Dias (no fuso do app) cobertos por um período, até `lastDay` inclusive.
 * O dia da mudança pertence ao local NOVO; o local antigo vai até a véspera.
 */
export function periodDays(period: DateSpan, timeZone: string, lastDay: IsoDate): { from: IsoDate; to: IsoDate } | null {
  const from = toLocalDate(period.validFrom, timeZone);
  let to = lastDay;
  if (period.validTo) {
    const endDay = addDays(toLocalDate(period.validTo, timeZone), -1);
    if (endDay < to) to = endDay;
  }
  return from <= to ? { from, to } : null;
}

/**
 * Janelas de dias que cada fonte de clima cobre dentro de [from, to].
 * É o que o índice de conforto e a linha do tempo usam para montar a série de uma planta
 * que passou por mais de uma fonte no período consultado.
 */
export function climateWindows(
  segments: ClimateSegment[],
  timeZone: string,
  from: IsoDate,
  to: IsoDate,
): Array<{ source: ClimateSource; from: IsoDate; to: IsoDate }> {
  const out: Array<{ source: ClimateSource; from: IsoDate; to: IsoDate }> = [];
  for (const segment of segments) {
    const days = periodDays(segment, timeZone, to);
    if (!days) continue;
    const start = days.from > from ? days.from : from;
    if (start > days.to) continue;
    out.push({ source: segment.source, from: start, to: days.to });
  }
  return out;
}
