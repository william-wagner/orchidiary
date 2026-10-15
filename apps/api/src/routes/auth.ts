import { zValidator } from "../lib/validate.ts";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { loginSchema } from "@orchidiary/shared";
import { db, schema } from "../db/client.ts";
import { isProd } from "../env.ts";
import { verifyPassword } from "../auth/password.ts";
import { type AppEnv, createSession, deleteSession, requireUser, SESSION_COOKIE } from "../auth/session.ts";

export const authRoutes = new Hono<AppEnv>()
  .post("/login", zValidator("json", loginSchema), async (c) => {
    const { email, password } = c.req.valid("json");
    const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email.toLowerCase())).limit(1);
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return c.json({ error: "E-mail ou senha inválidos." }, 401);
    }
    const { token, expiresAt } = await createSession(user.id);
    setCookie(c, SESSION_COOKIE, token, {
      httpOnly: true,
      secure: isProd,
      sameSite: "Lax",
      path: "/",
      expires: expiresAt,
    });
    return c.json({ id: user.id, email: user.email, name: user.name, role: user.role });
  })
  .post("/logout", async (c) => {
    const token = getCookie(c, SESSION_COOKIE);
    if (token) await deleteSession(token);
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return c.body(null, 204);
  })
  .get("/me", requireUser, (c) => c.json(c.get("user")));
