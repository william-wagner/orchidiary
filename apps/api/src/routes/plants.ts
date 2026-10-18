import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
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
import { reverseGeocode } from "../services/geocode.ts";
import { ensureLocality, listLocations, localityColumns, movePlant } from "../services/locations.ts";
import { placeNameOf } from "../services/places.ts";
import { requestCoverIllustration } from "../services/illustration.ts";
import { savePhoto } from "../services/photos.ts";
import { summariesOf } from "../services/taxonomy.ts";

const { plants, plantLocations, places, photos, events, manualReadings, weatherDaily, taxa } = schema;

/** Planta com o táxon resolvido (nome completo e caminho na árvore). */
async function withTaxon<P extends typeof plants.$inferSelect>(plant: P) {
  const taxon = plant.taxonId ? ((await summariesOf([plant.taxonId])).get(plant.taxonId) ?? null) : null;
  return { ...plant, taxon };
}

async function assertTaxon(id: string | null | undefined) {
  if (!id) return;
  const [row] = await db.select({ id: taxa.id }).from(taxa).where(eq(taxa.id, id)).limit(1);
  if (!row) throw new HTTPException(400, { message: "Esse táxon não está no catálogo." });
}

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

  // Coleção: plantas com local atual, última foto e se está em flor
  .get("/", async (c) => {
    const userId = c.get("user").id;
    const [rows, lastPhotos, lastBloomEvents] = await Promise.all([
      db
        .select({ plant: plants, location: plantLocations, placeName: places.name })
        .from(plants)
        .leftJoin(plantLocations, and(eq(plantLocations.plantId, plants.id), isNull(plantLocations.validTo)))
        .leftJoin(places, eq(places.id, plantLocations.placeId))
        .where(eq(plants.userId, userId))
        .orderBy(desc(plants.accessionNumber)),
      db
        .selectDistinctOn([photos.plantId], { plantId: photos.plantId, id: photos.id })
        .from(photos)
        .where(eq(photos.userId, userId))
        .orderBy(photos.plantId, desc(photos.takenAt)),
      db
        .selectDistinctOn([events.plantId], { plantId: events.plantId, type: events.type })
        .from(events)
        .where(and(eq(events.userId, userId), inArray(events.type, ["bloom_start", "bloom_end"])))
        .orderBy(events.plantId, desc(events.occurredAt)),
    ]);
    const photoBy = new Map(lastPhotos.map((p) => [p.plantId, p.id]));
    const bloomBy = new Map(lastBloomEvents.map((e) => [e.plantId, e.type === "bloom_start"]));
    const coverOf = (p: typeof plants.$inferSelect) => p.coverPhotoId ?? photoBy.get(p.id) ?? null;
    const coverIds = rows.map((r) => coverOf(r.plant)).filter((id): id is string => !!id);
    const illustrated = coverIds.length
      ? await db
          .select({ id: photos.id, updatedAt: photos.illustrationUpdatedAt })
          .from(photos)
          .where(and(inArray(photos.id, coverIds), eq(photos.illustrationStatus, "ready")))
      : [];
    const illustratedAt = new Map(illustrated.map((p) => [p.id, p.updatedAt]));
    const taxonBy = await summariesOf(rows.map((r) => r.plant.taxonId));
    return c.json(
      rows.map((r) => {
        const cover = coverOf(r.plant);
        return {
          ...r.plant,
          taxon: (r.plant.taxonId && taxonBy.get(r.plant.taxonId)) || null,
          currentLocation: r.location && { ...r.location, placeName: r.placeName },
          lastPhotoId: cover,
          /** Quando a prancha botânica da capa ficou pronta (versiona a URL da imagem) */
          coverIllustratedAt: (cover && illustratedAt.get(cover)) || null,
          inBloom: bloomBy.get(r.plant.id) ?? false,
        };
      }),
    );
  })

  .post("/", zValidator("json", plantCreateSchema), async (c) => {
    const { location, ...data } = c.req.valid("json");
    const userId = c.get("user").id;
    await assertTaxon(data.taxonId);
    const placeName = await placeNameOf(userId, location.placeId);
    const locality = await reverseGeocode(location.lat, location.lng);
    const created = await db.transaction(async (tx) => {
      // Próximo número de tombo (nunca reaproveitado; o índice único protege contra corrida)
      const [{ next } = { next: 1 }] = await tx
        .select({ next: sql<number>`coalesce(max(${plants.accessionNumber}), 0) + 1` })
        .from(plants)
        .where(eq(plants.userId, userId));
      const [plant] = await tx
        .insert(plants)
        .values({ ...data, userId, accessionNumber: Number(next) })
        .returning();
      const [loc] = await tx
        .insert(plantLocations)
        .values({
          plantId: plant!.id,
          lat: location.lat,
          lng: location.lng,
          ...localityColumns(locality),
          placeId: location.placeId ?? null,
          environment: location.environment,
          validFrom: location.validFrom ?? data.acquiredAt ?? new Date(),
        })
        .returning();
      return { ...plant!, currentLocation: { ...loc!, placeName } };
    });
    return c.json(created, 201);
  })

  .get("/:id", async (c) => {
    const plant = await ownedPlant(c.req.param("id"), c.get("user").id);
    const locations = await listLocations(plant.id);
    return c.json({ ...(await withTaxon(plant)), locations, currentLocation: locations.find((l) => l.validTo === null) ?? null });
  })

  .patch("/:id", zValidator("json", plantUpdateSchema), async (c) => {
    const userId = c.get("user").id;
    const plant = await ownedPlant(c.req.param("id"), userId);
    const { placeId, ...input } = c.req.valid("json");
    await assertTaxon(input.taxonId);
    await placeNameOf(userId, placeId);
    if (input.coverPhotoId) {
      const [photo] = await db
        .select({ id: photos.id })
        .from(photos)
        .where(and(eq(photos.id, input.coverPhotoId), eq(photos.plantId, plant.id)))
        .limit(1);
      if (!photo) return c.json({ error: "A foto de capa precisa ser desta planta." }, 400);
    }
    const updated = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(plants)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(plants.id, plant.id))
        .returning();
      // Corrige o nome do lugar do período atual. Coordenadas e histórico não mudam;
      // mudar de lugar de fato continua sendo um novo período (POST /:id/locations).
      if (placeId !== undefined) {
        await tx
          .update(plantLocations)
          .set({ placeId })
          .where(and(eq(plantLocations.plantId, plant.id), isNull(plantLocations.validTo)));
      }
      return row!;
    });
    if (input.coverPhotoId !== undefined) requestCoverIllustration(plant.id);
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
    const saved = await savePhoto({ plantId: plant.id, userId: user.id, file, meta: meta.data });
    // sem capa escolhida, a foto nova pode ter virado a capa
    if (!plant.coverPhotoId) requestCoverIllustration(plant.id);
    return c.json(saved, 201);
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
    const listed = await listLocations(plant.id);
    // Completa cidade/estado/país do local atual de plantas antigas (só lê o histórico, não muda coordenadas)
    const locations = await Promise.all(listed.map((l) => (l.validTo === null ? ensureLocality(l) : l)));
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

    return c.json({ plant: await withTaxon(plant), locations, photos: photoRows, events: eventRows, readings: readingRows, weather: weatherRows });
  });
