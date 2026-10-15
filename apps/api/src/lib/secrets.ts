import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Criptografia AES-256-GCM para segredos de integrações (token do bot do Telegram,
 * refresh token do Google). A chave vem de SECRETS_KEY (32 bytes em base64).
 */
function key(raw: string | undefined): Buffer {
  if (!raw) throw new Error("SECRETS_KEY não configurada — necessária para salvar integrações.");
  const k = Buffer.from(raw, "base64");
  if (k.length !== 32) throw new Error("SECRETS_KEY deve ter 32 bytes em base64.");
  return k;
}

export function encryptJson(value: unknown, rawKey: string | undefined): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(rawKey), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64")).join(".");
}

export function decryptJson<T>(payload: string, rawKey: string | undefined): T {
  const [iv, tag, data] = payload.split(".").map((p) => Buffer.from(p, "base64"));
  if (!iv || !tag || !data) throw new Error("Segredo corrompido.");
  const decipher = createDecipheriv("aes-256-gcm", key(rawKey), iv);
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8")) as T;
}
