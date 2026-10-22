import { randomBytes } from "node:crypto";
import type { HttpClient } from "../http/client.ts";
import { http } from "../http/clients.ts";

/**
 * Cliente mínimo do Google Drive (OAuth 2.0 + REST), sem o SDK do Google.
 * Escopo `drive.file`: o app só enxerga os arquivos e pastas que ele mesmo criou.
 */
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";

export const newOAuthState = () => randomBytes(24).toString("base64url");

export function buildAuthUrl(p: { clientId: string; redirectUri: string; state: string }): string {
  const url = new URL(AUTH_URL);
  url.searchParams.set("client_id", p.clientId);
  url.searchParams.set("redirect_uri", p.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", `${DRIVE_SCOPE} openid email`);
  url.searchParams.set("access_type", "offline"); // devolve refresh_token
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", p.state);
  return url.toString();
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
}

async function tokenRequest(body: Record<string, string>, client: HttpClient): Promise<TokenResponse> {
  return client.call(
    {
      operation: body.grant_type === "refresh_token" ? "token.refresh" : "token.exchange",
      url: TOKEN_URL,
      init: {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(body),
        signal: AbortSignal.timeout(20_000),
      },
    },
    async (res) => {
      const json = (await res.json()) as TokenResponse;
      if (!res.ok || json.error) throw new Error(`Google OAuth: ${json.error_description ?? json.error ?? res.status}`);
      return json;
    },
  );
}

/** Troca o código do callback por tokens. Também devolve o e-mail da conta conectada. */
export async function exchangeCode(
  p: { clientId: string; clientSecret: string; redirectUri: string; code: string },
  client: HttpClient = http.googleOAuth,
): Promise<{ refreshToken: string; email?: string }> {
  const t = await tokenRequest(
    { code: p.code, client_id: p.clientId, client_secret: p.clientSecret, redirect_uri: p.redirectUri, grant_type: "authorization_code" },
    client,
  );
  if (!t.refresh_token) throw new Error("O Google não devolveu refresh_token. Remova o acesso do app na conta Google e conecte de novo.");
  return { refreshToken: t.refresh_token, email: t.id_token ? emailFromIdToken(t.id_token) : undefined };
}

export function emailFromIdToken(idToken: string): string | undefined {
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1] ?? "", "base64url").toString("utf8")) as { email?: string };
    return payload.email;
  } catch {
    return undefined;
  }
}

export class DriveClient {
  private accessToken?: string;

  constructor(
    private readonly creds: { clientId: string; clientSecret: string; refreshToken: string },
    private readonly clients: { oauth: HttpClient; drive: HttpClient } = { oauth: http.googleOAuth, drive: http.googleDrive },
  ) {}

  private async token(): Promise<string> {
    if (!this.accessToken) {
      const t = await tokenRequest(
        {
          client_id: this.creds.clientId,
          client_secret: this.creds.clientSecret,
          refresh_token: this.creds.refreshToken,
          grant_type: "refresh_token",
        },
        this.clients.oauth,
      );
      this.accessToken = t.access_token;
    }
    return this.accessToken;
  }

  private async call<T>(operation: string, url: string, init: RequestInit = {}, meta?: Record<string, unknown>): Promise<T> {
    const authorization = `Bearer ${await this.token()}`;
    return this.clients.drive.call(
      {
        operation,
        url,
        meta,
        init: { ...init, headers: { ...(init.headers as Record<string, string>), authorization }, signal: AbortSignal.timeout(120_000) },
      },
      async (res) => {
        if (!res.ok) throw new Error(`Google Drive ${res.status}: ${await res.text()}`);
        return (res.status === 204 ? undefined : await res.json()) as T;
      },
    );
  }

  async findFolder(name: string, parentId?: string): Promise<string | undefined> {
    const q = [
      `name = '${name.replace(/'/g, "\\'")}'`,
      "mimeType = 'application/vnd.google-apps.folder'",
      "trashed = false",
      parentId ? `'${parentId}' in parents` : undefined,
    ]
      .filter(Boolean)
      .join(" and ");
    const r = await this.call<{ files: Array<{ id: string }> }>("files.list", `${API}/files?q=${encodeURIComponent(q)}&fields=files(id)`);
    return r.files[0]?.id;
  }

  async ensureFolder(name: string, parentId?: string): Promise<string> {
    const found = await this.findFolder(name, parentId);
    if (found) return found;
    const r = await this.call<{ id: string }>("folders.create", `${API}/files?fields=id`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: parentId ? [parentId] : undefined }),
    });
    return r.id;
  }

  async upload(p: { name: string; mimeType: string; data: Buffer; parentId: string }): Promise<{ id: string; size: number }> {
    const { body, contentType } = buildMultipart({ name: p.name, parents: [p.parentId] }, p.mimeType, p.data);
    const r = await this.call<{ id: string; size?: string }>("files.upload", `${UPLOAD}?uploadType=multipart&fields=id,size`, {
      method: "POST",
      headers: { "content-type": contentType },
      body: new Uint8Array(body),
    });
    return { id: r.id, size: Number(r.size ?? p.data.length) };
  }

  async listFiles(parentId: string, namePrefix: string): Promise<Array<{ id: string; name: string; createdTime: string }>> {
    const q = `'${parentId}' in parents and trashed = false and name contains '${namePrefix}'`;
    const r = await this.call<{ files: Array<{ id: string; name: string; createdTime: string }> }>(
      "files.list",
      `${API}/files?q=${encodeURIComponent(q)}&orderBy=createdTime desc&pageSize=200&fields=files(id,name,createdTime)`,
    );
    return r.files;
  }

  async delete(fileId: string): Promise<void> {
    await this.call("files.delete", `${API}/files/${fileId}`, { method: "DELETE" });
  }
}

/** Corpo multipart/related (metadados JSON + conteúdo) exigido pelo upload do Drive. */
export function buildMultipart(metadata: object, mimeType: string, data: Buffer): { body: Buffer; contentType: string } {
  const boundary = `orchidiary_${randomBytes(8).toString("hex")}`;
  const head = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`;
  const tail = `\r\n--${boundary}--`;
  return {
    body: Buffer.concat([Buffer.from(head, "utf8"), data, Buffer.from(tail, "utf8")]),
    contentType: `multipart/related; boundary=${boundary}`,
  };
}
