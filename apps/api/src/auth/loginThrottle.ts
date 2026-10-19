/**
 * Limite de tentativas de login, em memória (a API roda numa instância só).
 * Conta falhas numa janela fixa por e-mail+IP (quem tenta adivinhar a senha de uma conta)
 * e por IP (quem testa vários e-mails). Login certo zera o contador de e-mail+IP.
 */

export interface ThrottleOptions {
  windowMs: number;
  maxPerAccount: number;
  maxPerIp: number;
  now?: () => number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

export function createLoginThrottle({ windowMs, maxPerAccount, maxPerIp, now = Date.now }: ThrottleOptions) {
  const buckets = new Map<string, Bucket>();

  const keys = (email: string, ip: string) => ({ account: `a:${email}|${ip}`, ip: `i:${ip}` });

  function live(key: string): Bucket | undefined {
    const b = buckets.get(key);
    if (b && b.resetAt <= now()) {
      buckets.delete(key);
      return undefined;
    }
    return b;
  }

  function bump(key: string) {
    const b = live(key);
    if (b) b.count++;
    else buckets.set(key, { count: 1, resetAt: now() + windowMs });
  }

  return {
    /** Segundos até poder tentar de novo, ou 0 se está liberado. */
    blockedFor(email: string, ip: string): number {
      const k = keys(email, ip);
      const blocked = [
        [live(k.account), maxPerAccount],
        [live(k.ip), maxPerIp],
      ] as const;
      let until = 0;
      for (const [b, max] of blocked) if (b && b.count >= max) until = Math.max(until, b.resetAt);
      return until ? Math.ceil((until - now()) / 1000) : 0;
    },
    fail(email: string, ip: string) {
      const k = keys(email, ip);
      bump(k.account);
      bump(k.ip);
    },
    succeed(email: string, ip: string) {
      buckets.delete(keys(email, ip).account);
    },
    /** Descarta janelas vencidas (chamado periodicamente). */
    sweep() {
      const t = now();
      for (const [key, b] of buckets) if (b.resetAt <= t) buckets.delete(key);
    },
    get size() {
      return buckets.size;
    },
  };
}

export type LoginThrottle = ReturnType<typeof createLoginThrottle>;

export const loginThrottle = createLoginThrottle({ windowMs: 15 * 60_000, maxPerAccount: 5, maxPerIp: 20 });
setInterval(() => loginThrottle.sweep(), 5 * 60_000).unref();
