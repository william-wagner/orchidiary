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

/** Diferença do fuso para o UTC naquele instante, em minutos (ex.: -180 em São Paulo). */
function offsetMinutes(instant: Date, timeZone: string): number {
  const name =
    new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" }).formatToParts(instant).find((p) => p.type === "timeZoneName")
      ?.value ?? "GMT";
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(name);
  if (!m) return 0;
  return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
}

/** Instante em que o dia local começa (00:00 no fuso). */
export function startOfLocalDay(date: IsoDate, timeZone: string): Date {
  const midnightUtc = Date.parse(`${date}T00:00:00Z`);
  const guess = midnightUtc - offsetMinutes(new Date(midnightUtc), timeZone) * 60_000;
  // perto de uma troca de horário o deslocamento muda: confere no instante encontrado
  return new Date(midnightUtc - offsetMinutes(new Date(guess), timeZone) * 60_000);
}

/** Hora local (0–23) de um instante. */
export function localHour(instant: Date, timeZone: string): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(instant));
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

const ROMAN_MONTHS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

/**
 * Data no estilo de etiqueta de herbário: dia, mês em algarismo romano, ano.
 * Ex.: 14.X.2026. Usa o dia local do fuso informado.
 */
export function herbariumDate(instant: Date | string, timeZone: string): string {
  const d = typeof instant === "string" && /^\d{4}-\d{2}-\d{2}$/.test(instant) ? instant : toLocalDate(new Date(instant), timeZone);
  const [y, m, day] = d.split("-");
  return `${Number(day)}.${ROMAN_MONTHS[Number(m) - 1]}.${y}`;
}

/** Número de tombo com quatro dígitos: 7 → "0007". */
export const formatAccession = (n: number | null | undefined) => (n == null ? "s/n" : String(n).padStart(4, "0"));

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
