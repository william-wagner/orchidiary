import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { env } from "../env.ts";

/**
 * Armazenamento de arquivos. Hoje é o disco local; a interface permite trocar
 * por S3/Cloudflare R2 quando o app for público, sem mexer nas rotas.
 */
export interface Storage {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
}

const root = resolve(env.STORAGE_DIR);

function safePath(key: string): string {
  const p = resolve(join(root, key));
  if (!p.startsWith(root)) throw new Error("Chave de arquivo inválida.");
  return p;
}

export const storage: Storage = {
  async put(key, data) {
    const p = safePath(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, data);
  },
  async get(key) {
    return readFile(safePath(key));
  },
};

export const newPhotoKey = (plantId: string, ext: string) => `${plantId}/${randomUUID()}.${ext}`;
