import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { UserRole } from "@orchidiary/shared";
import { db, schema } from "../db/client.ts";
import { setContextUser } from "../http/context.ts";

export const SESSION_COOKIE = "orchidiary_session";
export const SESSION_TTL_DAYS = 60;

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

export type AppEnv = { Variables: { user: SessionUser; requestId: string } };

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000);
  await db.insert(schema.sessions).values({ id: hashToken(token), userId, expiresAt });
  return { token, expiresAt };
}

export async function deleteSession(token: string): Promise<void> {
  await db.delete(schema.sessions).where(eq(schema.sessions.id, hashToken(token)));
}

async function userFromToken(token: string): Promise<SessionUser | null> {
  const [row] = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
      role: schema.users.role,
    })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(and(eq(schema.sessions.id, hashToken(token)), gt(schema.sessions.expiresAt, new Date())))
    .limit(1);
  return row ?? null;
}

/** Exige usuário logado. */
export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE);
  const user = token ? await userFromToken(token) : null;
  if (!user) throw new HTTPException(401, { message: "Faça login." });
  c.set("user", user);
  setContextUser(user.id);
  await next();
});

/** Exige usuário master (telas de integração: Google Drive, Telegram, backups). */
export const requireMaster = createMiddleware<AppEnv>(async (c, next) => {
  if (c.get("user")?.role !== "master") throw new HTTPException(403, { message: "Acesso restrito ao usuário master." });
  await next();
});
