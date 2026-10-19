import type { Context } from "hono";
import { getConnInfo } from "@hono/node-server/conninfo";
import { env } from "../env.ts";

/**
 * IP de quem fez a requisição. Atrás de um proxy (Caddy), a conexão vem do proxy;
 * com TRUST_PROXY=true vale o último endereço do X-Forwarded-For, que é o que o
 * nosso proxy acrescentou (os anteriores podem ter sido forjados pelo cliente).
 */
export function clientIp(c: Context): string | undefined {
  if (env.TRUST_PROXY) {
    const last = c.req.header("x-forwarded-for")?.split(",").at(-1)?.trim();
    if (last) return last;
  }
  try {
    return getConnInfo(c).remote.address;
  } catch {
    // fora de um servidor Node (testes): sem IP
    return undefined;
  }
}
