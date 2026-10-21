import { and, asc, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import {
  addDays,
  BATCH_EVENT_TYPES,
  manualReadingSchema,
  placeBatchSchema,
  placeCreateSchema,
  placeInputSchema,
  placeLocationInputSchema,
  RetroactiveMoveError,
  toLocalDate,
} from "@orchidiary/shared";
import { db, schema } from "../db/client.ts";
import { type AppEnv, requireUser } from "../auth/session.ts";
import { zValidator } from "../lib/validate.ts";
import { env } from "../env.ts";
import { batchContext, createBatch, createPlaceReading, deletePlaceReading, undoBatch } from "../services/batches.ts";
import {
  createPlaceLocation,
  isForeignKeyViolation,
  isUniqueViolation,
  listPlaceLocations,
  movePlace,
} from "../services/places.ts";

const { places, placeLocations, plantLocations, plants, weatherDaily } = schema;

/** Quantos dias de clima do lugar a lista e a ficha mostram. */
const WEATHER_DAYS = 30;

/** Série de clima de um lugar: junta os períodos de localização dele, em ordem. */
async function placeWeather(placeId: string, days = WEATHER_DAYS) {
  const end = addDays(toLocalDate(new Date(), env.APP_TIMEZONE), -1);
  const periods = await listPlaceLocations(placeId);
  if (!periods.length) return { from: addDays(end, -(days - 1)), to: end, days: [] };
  const rows = await db
    .select({
      date: weatherDaily.date,
      tempMin: weatherDaily.tempMin,
      tempMax: weatherDaily.tempMax,
      tempMean: weatherDaily.tempMean,
      humidityMean: weatherDaily.humidityMean,
      humidityMin: weatherDaily.humidityMin,
      humidityMax: weatherDaily.humidityMax,
      precipitation: weatherDaily.precipitation,
    })
    .from(weatherDaily)
    .where(and(inArray(weatherDaily.placeLocationId, periods.map((p) => p.id)), gte(weatherDaily.date, addDays(end, -(days - 1)))))
    .orderBy(asc(weatherDaily.date));
  return { from: addDays(end, -(days - 1)), to: end, days: rows };
}

const notFound = () => new HTTPException(404, { message: "Lugar não encontrado." });
const idParam = (id: string) => {
  if (!z.string().uuid().safeParse(id).success) throw notFound();
  return id;
};

/** Id do lugar da URL, conferindo que é do usuário. */
async function ownedPlace(rawId: string, userId: string) {
  const id = idParam(rawId);
  const [place] = await db
    .select({ id: places.id })
    .from(places)
    .where(and(eq(places.id, id), eq(places.userId, userId)))
    .limit(1);
  if (!place) throw notFound();
  return id;
}

const uuidParam = (id: string, message: string) => {
  if (!z.string().uuid().safeParse(id).success) throw new HTTPException(404, { message });
  return id;
};

/**
 * Lugares nomeados do usuário. O cadastro e a manutenção acontecem no próprio campo
 * "Nome do lugar": digitar um nome novo cria, e cada lugar da lista pode ser renomeado ou apagado.
 */
export const placeRoutes = new Hono<AppEnv>()
  .use(requireUser)

  // Lista: cada lugar com a localização atual e a série de clima dos últimos 30 dias.
  // `plantCount`: plantas que estão lá agora; `usedCount`: períodos de permanência (inclui o histórico)
  .get("/", async (c) => {
    const rows = await db
      .select({
        id: places.id,
        name: places.name,
        environment: places.environment,
        location: placeLocations,
        plantCount: sql<number>`count(${plantLocations.id}) filter (where ${plantLocations.validTo} is null)::int`,
        usedCount: sql<number>`count(${plantLocations.id})::int`,
      })
      .from(places)
      .leftJoin(placeLocations, and(eq(placeLocations.placeId, places.id), isNull(placeLocations.validTo)))
      .leftJoin(plantLocations, eq(plantLocations.placeId, places.id))
      .where(eq(places.userId, c.get("user").id))
      .groupBy(places.id, placeLocations.id)
      .orderBy(asc(sql`lower(${places.name})`));
    return c.json(await Promise.all(rows.map(async (r) => ({ ...r, weather: (await placeWeather(r.id)).days }))));
  })

  /**
   * Cadastra o lugar com ambiente e localização. O clima dele começa a ser coletado na hora,
   * mesmo sem planta nenhuma ali. Se o nome já existe (sem diferenciar maiúsculas), devolve o existente.
   */
  .post("/", zValidator("json", placeCreateSchema), async (c) => {
    const userId = c.get("user").id;
    const { name, environment, lat, lng } = c.req.valid("json");
    const [created] = await db.insert(places).values({ userId, name, environment }).onConflictDoNothing().returning();
    if (created) {
      const location = await createPlaceLocation(created.id, { lat, lng });
      return c.json({ ...created, location, plantCount: 0, usedCount: 0, weather: [] }, 201);
    }
    const [existing] = await db
      .select()
      .from(places)
      .where(and(eq(places.userId, userId), sql`lower(${places.name}) = lower(${name})`))
      .limit(1);
    if (!existing) throw new HTTPException(500, { message: "Não foi possível salvar o lugar." });
    const [location] = await db
      .select()
      .from(placeLocations)
      .where(and(eq(placeLocations.placeId, existing.id), isNull(placeLocations.validTo)))
      .limit(1);
    return c.json({ ...existing, location: location ?? null }, 200);
  })

  // Ficha do lugar: localização atual, histórico, clima e as plantas que estão lá
  .get("/:id", async (c) => {
    const userId = c.get("user").id;
    const id = await ownedPlace(c.req.param("id"), userId);
    const [place] = await db.select().from(places).where(eq(places.id, id)).limit(1);
    const [history, weather, here] = await Promise.all([
      listPlaceLocations(id),
      placeWeather(id),
      db
        .select({
          id: plants.id,
          nickname: plants.nickname,
          taxonId: plants.taxonId,
          status: plants.status,
          coverPhotoId: plants.coverPhotoId,
          since: plantLocations.validFrom,
        })
        .from(plantLocations)
        .innerJoin(plants, eq(plants.id, plantLocations.plantId))
        .where(and(eq(plantLocations.placeId, id), isNull(plantLocations.validTo)))
        .orderBy(desc(plantLocations.validFrom)),
    ]);
    return c.json({
      ...place!,
      location: history.find((h) => h.validTo === null) ?? null,
      history,
      weather,
      plants: here,
      plantCount: here.length,
    });
  })

  // Clima do lugar, para o gráfico (`days` = quantos dias para trás)
  .get(
    "/:id/weather",
    zValidator("query", z.object({ days: z.coerce.number().int().min(1).max(400).default(WEATHER_DAYS) })),
    async (c) => {
      const id = await ownedPlace(c.req.param("id"), c.get("user").id);
      return c.json(await placeWeather(id, c.req.valid("query").days));
    },
  )

  // Histórico de localização do lugar
  .get("/:id/locations", async (c) => {
    const id = await ownedPlace(c.req.param("id"), c.get("user").id);
    return c.json(await listPlaceLocations(id));
  })

  /**
   * Muda a localização do lugar: fecha o período atual e abre outro.
   * O clima já coletado fica no período anterior, e as plantas daqui acompanham
   * a partir da data informada — nada é reescrito.
   */
  .post("/:id/locations", zValidator("json", placeLocationInputSchema), async (c) => {
    const id = await ownedPlace(c.req.param("id"), c.get("user").id);
    try {
      return c.json(await movePlace(id, c.req.valid("json")), 201);
    } catch (e) {
      if (e instanceof RetroactiveMoveError) return c.json({ error: e.message }, 409);
      throw e;
    }
  })

  // Renomear vale também para o histórico: é o mesmo lugar, só escrito de outro jeito.
  .patch("/:id", zValidator("json", placeInputSchema), async (c) => {
    const id = idParam(c.req.param("id"));
    try {
      const input = c.req.valid("json");
      const [updated] = await db
        .update(places)
        .set({
          ...(input.name !== undefined && { name: input.name }),
          ...(input.environment !== undefined && { environment: input.environment }),
        })
        .where(and(eq(places.id, id), eq(places.userId, c.get("user").id)))
        .returning();
      if (!updated) throw notFound();
      return c.json(updated);
    } catch (e) {
      if (isUniqueViolation(e)) throw new HTTPException(409, { message: "Já existe um lugar com esse nome." });
      throw e;
    }
  })

  // Só apaga lugar que nenhuma planta usa (nem no histórico), para não apagar o passado.
  .delete("/:id", async (c) => {
    const id = idParam(c.req.param("id"));
    const [place] = await db
      .select({ id: places.id })
      .from(places)
      .where(and(eq(places.id, id), eq(places.userId, c.get("user").id)))
      .limit(1);
    if (!place) throw notFound();
    const inUse = new HTTPException(409, { message: "Este lugar está no histórico de alguma planta, por isso não pode ser apagado." });
    const [{ used } = { used: 0 }] = await db
      .select({ used: sql<number>`count(*)::int` })
      .from(plantLocations)
      .where(eq(plantLocations.placeId, id));
    if (used > 0) throw inUse;
    try {
      await db.delete(places).where(eq(places.id, id));
    } catch (e) {
      // uma planta passou a usar o lugar entre a checagem e a exclusão (FK restrict)
      if (isForeignKeyViolation(e)) throw inUse;
      throw e;
    }
    return c.body(null, 204);
  })

  // ─── Registro em lote: a mesma ação para as plantas que estão no lugar ─────
  // Eventos recentes da ação (para achar duplicados) e as exclusões lembradas do último lote
  .get("/:id/batch-context", zValidator("query", z.object({ type: z.enum(BATCH_EVENT_TYPES) })), async (c) => {
    const userId = c.get("user").id;
    const id = await ownedPlace(c.req.param("id"), userId);
    return c.json(await batchContext(id, userId, c.req.valid("query").type));
  })

  .post("/:id/batches", zValidator("json", placeBatchSchema), async (c) => {
    const userId = c.get("user").id;
    const id = await ownedPlace(c.req.param("id"), userId);
    return c.json(await createBatch(id, userId, c.req.valid("json")), 201);
  })

  // "Desfazer" do toast: apaga os eventos do lote e devolve as exclusões lembradas de antes
  .post(
    "/:id/batches/:batchId/undo",
    zValidator("json", z.object({ restoreExcluded: z.array(z.string().uuid()).max(500).default([]) })),
    async (c) => {
      const userId = c.get("user").id;
      const id = await ownedPlace(c.req.param("id"), userId);
      const batchId = uuidParam(c.req.param("batchId"), "Esse lote não existe mais.");
      return c.json(await undoBatch(id, userId, batchId, c.req.valid("json").restoreExcluded));
    },
  )

  // Medição do lugar: vale para as plantas que estão lá, sem copiar para cada uma
  .post("/:id/readings", zValidator("json", manualReadingSchema), async (c) => {
    const userId = c.get("user").id;
    const id = await ownedPlace(c.req.param("id"), userId);
    return c.json(await createPlaceReading(id, userId, c.req.valid("json")), 201);
  })

  .delete("/:id/readings/:readingId", async (c) => {
    const userId = c.get("user").id;
    const id = await ownedPlace(c.req.param("id"), userId);
    await deletePlaceReading(id, userId, uuidParam(c.req.param("readingId"), "Essa medição não existe mais."));
    return c.body(null, 204);
  });
