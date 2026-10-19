import { zValidator } from "../lib/validate.ts";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { loginSchema } from "@orchidiary/shared";
import { db, schema } from "../db/client.ts";
import { isProd } from "../env.ts";
import { clientIp } from "../auth/clientIp.ts";
import { loginThrottle } from "../auth/loginThrottle.ts";
import { verifyPassword } from "../auth/password.ts";
import { audit } from "../logging/audit.ts";
import { type AppEnv, createSession, deleteSession, requireUser, SESSION_COOKIE } from "../auth/session.ts";

export const authRoutes = new Hono<AppEnv>()
  .post("/login", zValidator("json", loginSchema), async (c) => {
    const { email, password } = c.req.valid("json");
    const normalized = email.toLowerCase();
    const ip = clientIp(c) ?? "desconhecido";
    const wait = loginThrottle.blockedFor(normalized, ip);
    if (wait > 0) {
      audit(c, {
        event: "auth.login",
        outcome: "blocked",
        message: "login bloqueado por excesso de tentativas",
        context: { email: normalized },
      });
      c.header("Retry-After", String(wait));
      const minutes = Math.ceil(wait / 60);
      return c.json(
        { error: `Muitas tentativas. Tente de novo em ${minutes} ${minutes === 1 ? "minuto" : "minutos"}.` },
        429,
      );
    }
    const [user] = await db.select().from(schema.users).where(eq(schema.users.email, normalized)).limit(1);
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      loginThrottle.fail(normalized, ip);
      audit(c, {
        event: "auth.login",
        outcome: "failure",
        message: "falha de login",
        userId: user?.id,
        context: { email: normalized, reason: user ? "senha incorreta" : "e-mail não cadastrado" },
      });
      return c.json({ error: "E-mail ou senha inválidos." }, 401);
    }
    loginThrottle.succeed(normalized, ip);
    const { token, expiresAt } = await createSession(user.id);
    audit(c, { event: "auth.login", message: "login realizado", userId: user.id });
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
    if (token) {
      await deleteSession(token);
      audit(c, { event: "auth.logout", message: "logout realizado" });
    }
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return c.body(null, 204);
  })
  .get("/me", requireUser, (c) => c.json(c.get("user")));
