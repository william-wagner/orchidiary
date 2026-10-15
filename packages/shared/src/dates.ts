/**
 * Datas "de calendário" (YYYY-MM-DD) num fuso específico.
 * O diário trabalha com dias locais, não com instantes UTC.
 */
export type IsoDate = string;

export function toLocalDate(instant: Date, timeZone: string): IsoDate {
  // en-CA formata como YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Todas as datas de `from` até `to`, inclusive. Vazio se from > to. */
export function dateRange(from: IsoDate, to: IsoDate): IsoDate[] {
  const out: IsoDate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/**
 * Agrupa datas soltas em intervalos contíguos, para pedir à API de clima
 * o mínimo de requisições possível.
 */
export function toContiguousRanges(dates: IsoDate[]): Array<{ from: IsoDate; to: IsoDate }> {
  const sorted = [...new Set(dates)].sort();
  const ranges: Array<{ from: IsoDate; to: IsoDate }> = [];
  for (const d of sorted) {
    const last = ranges.at(-1);
    if (last && addDays(last.to, 1) === d) last.to = d;
    else ranges.push({ from: d, to: d });
  }
  return ranges;
}
