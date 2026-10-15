import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db, schema } from "../db/client.ts";

const { places } = schema;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Nome do lugar do usuário; 400 se o id não existe ou é de outra pessoa. Sem id, devolve null. */
export async function placeNameOf(userId: string, placeId: string | null | undefined, tx: Tx | typeof db = db) {
  if (!placeId) return null;
  const [row] = await tx
    .select({ name: places.name })
    .from(places)
    .where(and(eq(places.id, placeId), eq(places.userId, userId)))
    .limit(1);
  if (!row) throw new HTTPException(400, { message: "Esse lugar não existe." });
  return row.name;
}

const pgCode = (e: unknown) => {
  const err = e as { code?: string; cause?: { code?: string } };
  return err?.code ?? err?.cause?.code;
};
export const isUniqueViolation = (e: unknown) => pgCode(e) === "23505";
export const isForeignKeyViolation = (e: unknown) => pgCode(e) === "23503";
