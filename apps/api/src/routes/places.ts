import { and, asc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { placeInputSchema } from "@orchidiary/shared";
import { db, schema } from "../db/client.ts";
import { type AppEnv, requireUser } from "../auth/session.ts";
import { zValidator } from "../lib/validate.ts";
import { isForeignKeyViolation, isUniqueViolation } from "../services/places.ts";

const { places, plantLocations } = schema;

const notFound = () => new HTTPException(404, { message: "Lugar não encontrado." });
const idParam = (id: string) => {
  if (!z.string().uuid().safeParse(id).success) throw notFound();
  return id;
};

/**
 * Lugares nomeados do usuário. O cadastro e a manutenção acontecem no próprio campo
 * "Nome do lugar": digitar um nome novo cria, e cada lugar da lista pode ser renomeado ou apagado.
 */
export const placeRoutes = new Hono<AppEnv>()
  .use(requireUser)

  // `plantCount`: plantas que estão lá agora; `usedCount`: períodos de local (inclui o histórico)
  .get("/", async (c) => {
    const rows = await db
      .select({
        id: places.id,
        name: places.name,
        plantCount: sql<number>`count(${plantLocations.id}) filter (where ${plantLocations.validTo} is null)::int`,
        usedCount: sql<number>`count(${plantLocations.id})::int`,
      })
      .from(places)
      .leftJoin(plantLocations, eq(plantLocations.placeId, places.id))
      .where(eq(places.userId, c.get("user").id))
      .groupBy(places.id)
      .orderBy(asc(sql`lower(${places.name})`));
    return c.json(rows);
  })

  // Idempotente: se o nome já existe (sem diferenciar maiúsculas), devolve o lugar existente.
  .post("/", zValidator("json", placeInputSchema), async (c) => {
    const userId = c.get("user").id;
    const { name } = c.req.valid("json");
    const [created] = await db.insert(places).values({ userId, name }).onConflictDoNothing().returning();
    if (created) return c.json({ ...created, plantCount: 0, usedCount: 0 }, 201);
    const [existing] = await db
      .select()
      .from(places)
      .where(and(eq(places.userId, userId), sql`lower(${places.name}) = lower(${name})`))
      .limit(1);
    if (!existing) throw new HTTPException(500, { message: "Não foi possível salvar o lugar." });
    return c.json(existing, 200);
  })

  // Renomear vale também para o histórico: é o mesmo lugar, só escrito de outro jeito.
  .patch("/:id", zValidator("json", placeInputSchema), async (c) => {
    const id = idParam(c.req.param("id"));
    try {
      const [updated] = await db
        .update(places)
        .set({ name: c.req.valid("json").name })
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
  });
