import { randomUUID } from "node:crypto";
import { and, eq, gte, inArray, isNull } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { type BatchEventType, joinsBatch, type ManualReadingInput } from "@orchidiary/shared";
import { db, schema } from "../db/client.ts";

const { events, manualReadings, placeBatchExclusions, plantLocations, plants } = schema;

/** Janela dos eventos recentes que a folha de lote usa para achar duplicados (cobre "ontem"). */
const RECENT_DAYS = 3;

/** Plantas que estão no lugar agora e ainda fazem parte da coleção. */
async function plantsHere(placeId: string, userId: string) {
  const rows = await db
    .select({ id: plants.id, status: plants.status })
    .from(plants)
    .innerJoin(plantLocations, and(eq(plantLocations.plantId, plants.id), isNull(plantLocations.validTo)))
    .where(and(eq(plants.userId, userId), eq(plantLocations.placeId, placeId)));
  return new Set(rows.filter((r) => joinsBatch(r.status)).map((r) => r.id));
}

async function rememberedOf(placeId: string, type: BatchEventType) {
  const rows = await db
    .select({ plantId: placeBatchExclusions.plantId })
    .from(placeBatchExclusions)
    .where(and(eq(placeBatchExclusions.placeId, placeId), eq(placeBatchExclusions.type, type)));
  return rows.map((r) => r.plantId);
}

/** O que a folha de lote precisa para montar a seleção inicial (ver `batchDefaults`). */
export async function batchContext(placeId: string, userId: string, type: BatchEventType) {
  const since = new Date(Date.now() - RECENT_DAYS * 86_400_000);
  const [recent, remembered] = await Promise.all([
    db
      .select({ plantId: events.plantId, occurredAt: events.occurredAt })
      .from(events)
      .innerJoin(plantLocations, and(eq(plantLocations.plantId, events.plantId), isNull(plantLocations.validTo)))
      .where(and(eq(events.userId, userId), eq(events.type, type), gte(events.occurredAt, since), eq(plantLocations.placeId, placeId))),
    rememberedOf(placeId, type),
  ]);
  return { recent, remembered };
}

const assertNotFuture = (at: Date) => {
  if (at.getTime() > Date.now() + 60_000) throw new HTTPException(400, { message: "A data não pode estar no futuro." });
};

/**
 * Um evento para cada planta marcada, todos com o mesmo batch_id, e a nova lista de
 * exclusões lembradas daquele local e ação. Devolve a lista anterior para o "Desfazer".
 */
export async function createBatch(
  placeId: string,
  userId: string,
  input: { type: BatchEventType; occurredAt?: Date; notes?: string | null; plantIds: string[]; rememberExcluded: string[] },
) {
  const occurredAt = input.occurredAt ?? new Date();
  assertNotFuture(occurredAt);
  const here = await plantsHere(placeId, userId);
  const plantIds = [...new Set(input.plantIds)];
  if (plantIds.some((id) => !here.has(id))) {
    throw new HTTPException(409, { message: "Alguma planta marcada não está mais neste lugar. Feche e abra o lote de novo." });
  }
  const marked = new Set(plantIds);
  const remember = [...new Set(input.rememberExcluded)].filter((id) => here.has(id) && !marked.has(id));
  const previousExcluded = await rememberedOf(placeId, input.type);
  const batchId = randomUUID();

  await db.transaction(async (tx) => {
    await tx.insert(events).values(
      plantIds.map((plantId) => ({ plantId, userId, type: input.type, occurredAt, notes: input.notes || null, data: {}, batchId })),
    );
    await tx.delete(placeBatchExclusions).where(and(eq(placeBatchExclusions.placeId, placeId), eq(placeBatchExclusions.type, input.type)));
    if (remember.length) {
      await tx.insert(placeBatchExclusions).values(remember.map((plantId) => ({ placeId, type: input.type, plantId })));
    }
  });
  return { batchId, count: plantIds.length, previousExcluded };
}

/** Desfaz um lote inteiro e devolve as exclusões lembradas de antes dele. */
export async function undoBatch(placeId: string, userId: string, batchId: string, restoreExcluded: string[]) {
  return db.transaction(async (tx) => {
    const removed = await tx
      .delete(events)
      .where(and(eq(events.batchId, batchId), eq(events.userId, userId)))
      .returning({ type: events.type });
    const type = removed[0]?.type;
    if (!type) throw new HTTPException(404, { message: "Esse lote não existe mais." });
    await tx.delete(placeBatchExclusions).where(and(eq(placeBatchExclusions.placeId, placeId), eq(placeBatchExclusions.type, type)));
    const ids = [...new Set(restoreExcluded)];
    const mine = ids.length
      ? await tx.select({ id: plants.id }).from(plants).where(and(inArray(plants.id, ids), eq(plants.userId, userId)))
      : [];
    if (mine.length) await tx.insert(placeBatchExclusions).values(mine.map((p) => ({ placeId, type, plantId: p.id })));
    return { count: removed.length };
  });
}

/** Medição do lugar: um registro só, que vale para quem está lá (ver `placeReadingsForPlant`). */
export async function createPlaceReading(placeId: string, userId: string, input: ManualReadingInput) {
  const measuredAt = input.measuredAt ?? new Date();
  assertNotFuture(measuredAt);
  if ((await plantsHere(placeId, userId)).size === 0) {
    throw new HTTPException(400, { message: "Nenhuma planta está neste lugar agora." });
  }
  const [reading] = await db
    .insert(manualReadings)
    .values({ ...input, measuredAt, placeId, userId })
    .returning();
  return reading!;
}

export async function deletePlaceReading(placeId: string, userId: string, readingId: string) {
  const removed = await db
    .delete(manualReadings)
    .where(and(eq(manualReadings.id, readingId), eq(manualReadings.placeId, placeId), eq(manualReadings.userId, userId)))
    .returning({ id: manualReadings.id });
  if (!removed.length) throw new HTTPException(404, { message: "Essa medição não existe mais." });
}
