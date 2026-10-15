import { asc, eq, ilike, or } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db, schema } from "../db/client.ts";
import { type AppEnv, requireMaster, requireUser } from "../auth/session.ts";
import { zValidator } from "../lib/validate.ts";

const speciesInput = z.object({
  genus: z.string().trim().min(1),
  epithet: z.string().trim().nullish(),
  displayName: z.string().trim().min(1),
  commonNames: z.array(z.string()).default([]),
  tempDayMin: z.number().nullish(),
  tempDayMax: z.number().nullish(),
  tempNightMin: z.number().nullish(),
  tempNightMax: z.number().nullish(),
  humidityMin: z.number().min(0).max(100).nullish(),
  humidityMax: z.number().min(0).max(100).nullish(),
  light: z.string().nullish(),
  watering: z.string().nullish(),
  fertilizing: z.string().nullish(),
  substrate: z.string().nullish(),
  bloomMonths: z.array(z.number().int().min(1).max(12)).default([]),
  restPeriod: z.string().nullish(),
  notes: z.string().nullish(),
});

/** Guia de Cultivo: leitura para todos; edição só pelo master (por enquanto). */
export const speciesRoutes = new Hono<AppEnv>()
  .use(requireUser)
  .get("/", zValidator("query", z.object({ q: z.string().optional() })), async (c) => {
    const { q } = c.req.valid("query");
    const where = q
      ? or(ilike(schema.species.displayName, `%${q}%`), ilike(schema.species.genus, `%${q}%`))
      : undefined;
    return c.json(await db.select().from(schema.species).where(where).orderBy(asc(schema.species.displayName)));
  })
  .get("/:id", async (c) => {
    const id = c.req.param("id");
    if (!z.string().uuid().safeParse(id).success) return c.notFound();
    const [row] = await db.select().from(schema.species).where(eq(schema.species.id, id)).limit(1);
    return row ? c.json(row) : c.notFound();
  })
  .post("/", requireMaster, zValidator("json", speciesInput), async (c) => {
    const [row] = await db.insert(schema.species).values(c.req.valid("json")).returning();
    return c.json(row, 201);
  })
  .put("/:id", requireMaster, zValidator("json", speciesInput), async (c) => {
    const [row] = await db
      .update(schema.species)
      .set({ ...c.req.valid("json"), updatedAt: new Date() })
      .where(eq(schema.species.id, c.req.param("id")))
      .returning();
    return row ? c.json(row) : c.notFound();
  });
