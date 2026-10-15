import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db, schema } from "../db/client.ts";
import { type AppEnv, requireUser } from "../auth/session.ts";
import { storage } from "../services/storage.ts";

export const photoRoutes = new Hono<AppEnv>()
  .use(requireUser)
  /** GET /photos/:id/file?size=thumb */
  .get("/:id/file", async (c) => {
    const id = c.req.param("id");
    if (!z.string().uuid().safeParse(id).success) return c.notFound();
    const [photo] = await db
      .select()
      .from(schema.photos)
      .where(and(eq(schema.photos.id, id), eq(schema.photos.userId, c.get("user").id)))
      .limit(1);
    if (!photo) return c.notFound();
    const key = c.req.query("size") === "thumb" && photo.thumbKey ? photo.thumbKey : photo.storageKey;
    const data = await storage.get(key);
    return c.body(new Uint8Array(data), 200, {
      "Content-Type": photo.mimeType,
      "Cache-Control": "private, max-age=31536000, immutable",
    });
  });
