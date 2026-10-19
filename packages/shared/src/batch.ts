import { toLocalDate, type IsoDate } from "./dates.ts";
import type { EventType, PlantStatus } from "./enums.ts";
import { periodAt, type LocationPeriod } from "./locations.ts";

/**
 * Registro em lote por local: a mesma ação para as plantas de um lugar de uma vez.
 * Cada planta continua ganhando o próprio evento (com o mesmo `batch_id`);
 * a medição em lote é do lugar, não da planta (manual_readings.place_id).
 */

/** Ações que dá para aplicar a um local inteiro. Floração, brotos e keikis são de cada planta. */
export const BATCH_EVENT_TYPES = ["watering", "fertilizing", "treatment", "note"] as const satisfies readonly EventType[];
export type BatchEventType = (typeof BATCH_EVENT_TYPES)[number];

/** Plantas que entram no lote: as que ainda estão na coleção (doadas e mortas ficam de fora). */
export const BATCH_PLANT_STATUSES = ["active", "dormant", "in_treatment"] as const satisfies readonly PlantStatus[];
export const joinsBatch = (status: string) => (BATCH_PLANT_STATUSES as readonly string[]).includes(status);

/** Por que uma planta veio desmarcada na folha de lote. */
export type BatchSkipReason =
  | { kind: "duplicate"; at: Date }
  | { kind: "remembered" };

export interface BatchDefaults {
  /** Plantas marcadas de saída, na ordem recebida */
  checked: string[];
  skipped: Record<string, BatchSkipReason>;
}

/**
 * Seleção inicial da folha de lote.
 * - Já tem a mesma ação no dia escolhido (no fuso de quem registra)? Vem desmarcada: quase sempre é engano.
 * - Ficou de fora do último lote desse local e dessa ação por escolha? Vem desmarcada de novo.
 * Duplicado tem prioridade, porque o motivo mostrado é o mais concreto.
 */
export function batchDefaults(input: {
  plantIds: string[];
  /** Eventos recentes da mesma ação nessas plantas */
  recent: Array<{ plantId: string; occurredAt: Date }>;
  /** Plantas desmarcadas à mão no último lote */
  remembered: string[];
  day: IsoDate;
  timeZone: string;
}): BatchDefaults {
  const sameDay = new Map<string, Date>();
  for (const e of input.recent) {
    if (toLocalDate(e.occurredAt, input.timeZone) !== input.day) continue;
    const prev = sameDay.get(e.plantId);
    if (!prev || e.occurredAt > prev) sameDay.set(e.plantId, e.occurredAt);
  }
  const remembered = new Set(input.remembered);
  const checked: string[] = [];
  const skipped: Record<string, BatchSkipReason> = {};
  for (const id of input.plantIds) {
    const dup = sameDay.get(id);
    if (dup) skipped[id] = { kind: "duplicate", at: dup };
    else if (remembered.has(id)) skipped[id] = { kind: "remembered" };
    else checked.push(id);
  }
  return { checked, skipped };
}

/**
 * Quem deve ser lembrado como exclusão no próximo lote: as plantas do lugar que ficaram
 * desmarcadas por escolha. As desmarcadas por duplicado não contam, porque saíram sozinhas.
 */
export function exclusionsToRemember(plantIds: string[], checked: Iterable<string>, skipped: Record<string, BatchSkipReason>): string[] {
  const on = new Set(checked);
  return plantIds.filter((id) => !on.has(id) && skipped[id]?.kind !== "duplicate");
}

/**
 * Leituras de um lugar que valem para uma planta: só as feitas enquanto ela estava lá.
 * Quem chega depois não herda o passado, e quem sai deixa de receber as novas.
 */
export function placeReadingsForPlant<R extends { placeId: string; measuredAt: Date }, P extends LocationPeriod & { placeId: string | null }>(
  readings: R[],
  periods: P[],
): R[] {
  return readings.filter((r) => periodAt(periods, r.measuredAt)?.placeId === r.placeId);
}
