import { and, asc, desc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import {
  eventCreateSchema,
  locationInputSchema,
  manualReadingSchema,
  photoMetaSchema,
  plantCreateSchema,
  plantUpdateSchema,
  RetroactiveMoveError,
} from "@orchidiary/shared";
import { db, schema } from "../db/client.ts";
import { type AppEnv, requireUser } from "../auth/session.ts";
import { zValidator } from "../lib/validate.ts";
import { listLocations, movePlant } from "../services/locations.ts";
import { savePhoto } from "../services/photos.ts";

const { plants, plantLocations, photos, events, manualReadings, weatherDaily } = schema;

async function ownedPlant(id: string, userId: string) {
  if (!z.string().uuid().safeParse(id).success) throw new HTTPException(404, { message: "Planta não encontrada." });
  const [plant] = await db
    .select()
    .from(plants)
    .where(and(eq(plants.id, id), eq(plants.userId, userId)))
    .limit(1);
  if (!plant) throw new HTTPException(404, { message: "Planta não encontrada." });
  return plant;
}

const rangeQuery = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const plantRoutes = new Hono<AppEnv>()
  .use(requireUser)

  // Coleção: plantas com o local atual
  .get("/", async (c) => {
    const rows = await db
      .select({ plant: plants, location: plantLocations })
      .from(plants)
      .leftJoin(plantLocations, and(eq(plantLocations.plantId, plants.id), isNull(plantLocations.validTo)))
      .where(eq(plants.userId, c.get("user").id))
      .orderBy(asc(plants.nickname));
    return c.json(rows.map((r) => ({ ...r.plant, currentLocation: r.location })));
  })

  .post("/", zValidator("json", plantCreateSchema), async (c) => {
    const { location, ...data } = c.req.valid("json");
    const userId = c.get("user").id;
    const created = await db.transaction(async (tx) => {
      const [plant] = await tx.insert(plants).values({ ...data, userId }).returning();
      const [loc] = await tx
        .insert(plantLocations)
        .values({
          plantId: plant!.id,
          lat: location.lat,
          lng: location.lng,
          label: location.label ?? null,
          environment: location.environment,
          validFrom: location.validFrom ?? data.acquiredAt ?? new Date(),
        })
        .returning();
      return { ...plant!, currentLocation: loc };
    });
    return c.json(created, 201);
  })

  .get("/:id", async (c) => {
    const plant = await ownedPlant(c.req.param("id"), c.get("user").id);
    const locations = await listLocations(plant.id);
    return c.json({ ...plant, locations, currentLocation: locations.find((l) => l.validTo === null) ?? null });
  })

  .patch("/:id", zValidator("json", plantUpdateSchema), async (c) => {
    const plant = await ownedPlant(c.req.param("id"), c.get("user").id);
    const [updated] = await db
      .update(plants)
      .set({ ...c.req.valid("json"), updatedAt: new Date() })
      .where(eq(plants.id, plant.id))
      .returning();
    return c.json(updated);
  })

  // ─── Local (histórico não retroativo) ──────────────────────────────────────
  .get("/:id/locations", async (c) => {
    const plant = await ownedPlant(c.req.param("id"), c.get("user").id);
    return c.json(await listLocations(plant.id));
  })

  .post("/:id/locations", zValidator("json", locationInputSchema), async (c) => {
    const user = c.get("user");
    const plant = await ownedPlant(c.req.param("id"), user.id);
    try {
      return c.json(await movePlant(plant.id, user.id, c.req.valid("json")), 201);
    } catch (e) {
      if (e instanceof RetroactiveMoveError) return c.json({ error: e.message }, 409);
      throw e;
    }
  })

  // ─── Fotos ─────────────────────────────────────────────────────────────────
  .post("/:id/photos", async (c) => {
    const user = c.get("user");
    const plant = await ownedPlant(c.req.param("id"), user.id);
    const body = await c.req.parseBody();
    const file = body.file;
    if (!(file instanceof File) || !file.type.startsWith("image/")) {
      return c.json({ error: "Envie uma imagem no campo 'file'." }, 400);
    }
    const meta = photoMetaSchema.safeParse(body);
    if (!meta.success) return c.json({ error: "Dados inválidos.", issues: meta.error.issues }, 400);
    // locationCheck.mismatch = true → o app pergunta "a planta mudou de lugar?"
    return c.json(await savePhoto({ plantId: plant.id, userId: user.id, file, meta: meta.data }), 201);
  })

  // ─── Eventos do diário ─────────────────────────────────────────────────────
  .post("/:id/events", zValidator("json", eventCreateSchema), async (c) => {
    const user = c.get("user");
    const plant = await ownedPlant(c.req.param("id"), user.id);
    const input = c.req.valid("json");
    const [event] = await db
      .insert(events)
      .values({ ...input, data: input.data ?? {}, occurredAt: input.occurredAt ?? new Date(), plantId: plant.id, userId: user.id })
      .returning();
    return c.json(event, 201);
  })

  // ─── Leituras manuais de temperatura/umidade ───────────────────────────────
  .post("/:id/readings", zValidator("json", manualReadingSchema), async (c) => {
    const user = c.get("user");
    const plant = await ownedPlant(c.req.param("id"), user.id);
    const input = c.req.valid("json");
    const [reading] = await db
      .insert(manualReadings)
      .values({ ...input, measuredAt: input.measuredAt ?? new Date(), plantId: plant.id, userId: user.id })
      .returning();
    return c.json(reading, 201);
  })

  // ─── Linha do tempo: tudo que aconteceu com o indivíduo ────────────────────
  .get("/:id/timeline", zValidator("query", rangeQuery), async (c) => {
    const plant = await ownedPlant(c.req.param("id"), c.get("user").id);
    const { from, to } = c.req.valid("query");
    const locations = await listLocations(plant.id);
    const locationIds = locations.map((l) => l.id);

    const between = <C extends typeof photos.takenAt | typeof events.occurredAt | typeof manualReadings.measuredAt>(col: C) =>
      [from ? gte(col, from) : undefined, to ? lte(col, to) : undefined];

    const [photoRows, eventRows, readingRows, weatherRows] = await Promise.all([
      db.select().from(photos).where(and(eq(photos.plantId, plant.id), ...between(photos.takenAt))).orderBy(desc(photos.takenAt)),
      db.select().from(events).where(and(eq(events.plantId, plant.id), ...between(events.occurredAt))).orderBy(desc(events.occurredAt)),
      db
        .select()
        .from(manualReadings)
        .where(and(eq(manualReadings.plantId, plant.id), ...between(manualReadings.measuredAt)))
        .orderBy(desc(manualReadings.measuredAt)),
      locationIds.length
        ? db
            .select()
            .from(weatherDaily)
            .where(
              and(
                inArray(weatherDaily.locationId, locationIds),
                from ? gte(weatherDaily.date, from.toISOString().slice(0, 10)) : undefined,
                to ? lte(weatherDaily.date, to.toISOString().slice(0, 10)) : undefined,
              ),
            )
            .orderBy(asc(weatherDaily.date))
        : Promise.resolve([]),
    ]);

    return c.json({ plant, locations, photos: photoRows, events: eventRows, readings: readingRows, weather: weatherRows });
  });
