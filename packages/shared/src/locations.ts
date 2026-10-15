import { addDays, toLocalDate, type IsoDate } from "./dates.ts";

/**
 * Histórico de localização de uma planta.
 *
 * Regra central do projeto: mudar a planta de lugar NUNCA altera o passado.
 * Cada mudança fecha o período atual (validTo) e abre um novo (validFrom).
 * Clima, fotos e eventos antigos continuam ligados ao local onde a planta
 * estava naquele momento — ela pode ter ido de uma cidade para outra.
 */
export interface LocationPeriod {
  id: string;
  validFrom: Date;
  /** null = período atual */
  validTo: Date | null;
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
 * Dias (no fuso do app) cobertos por um período, até `lastDay` inclusive.
 * O dia da mudança pertence ao local NOVO; o local antigo vai até a véspera.
 */
export function periodDays(period: LocationPeriod, timeZone: string, lastDay: IsoDate): { from: IsoDate; to: IsoDate } | null {
  const from = toLocalDate(period.validFrom, timeZone);
  let to = lastDay;
  if (period.validTo) {
    const endDay = addDays(toLocalDate(period.validTo, timeZone), -1);
    if (endDay < to) to = endDay;
  }
  return from <= to ? { from, to } : null;
}
