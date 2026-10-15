import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db, schema } from "../db/client.ts";
import { type AppEnv, requireUser } from "../auth/session.ts";
import { storage } from "../services/storage.ts";

export const photoRoutes = new Hono<AppEnv>()
  .use(requireUser)
  /** GET /photos/:id/file?size=thumb&variant=illustration */
  .get("/:id/file", async (c) => {
    const id = c.req.param("id");
    if (!z.string().uuid().safeParse(id).success) return c.notFound();
    const [photo] = await db
      .select()
      .from(schema.photos)
      .where(and(eq(schema.photos.id, id), eq(schema.photos.userId, c.get("user").id)))
      .limit(1);
    if (!photo) return c.notFound();
    const thumb = c.req.query("size") === "thumb";
    let key = thumb && photo.thumbKey ? photo.thumbKey : photo.storageKey;
    if (c.req.query("variant") === "illustration") {
      // Prancha botânica gerada a partir da foto de capa
      if (photo.illustrationStatus !== "ready" || !photo.illustrationKey) return c.notFound();
      key = thumb && photo.illustrationThumbKey ? photo.illustrationThumbKey : photo.illustrationKey;
    }
    const data = await storage.get(key);
    return c.body(new Uint8Array(data), 200, {
      "Content-Type": photo.mimeType,
      "Cache-Control": "private, max-age=31536000, immutable",
    });
  });
