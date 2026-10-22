/**
 * Registro das chamadas a serviços externos: regras puras (sem banco, sem rede).
 * O wrapper que mede e grava fica em apps/api/src/http; aqui ficam o vocabulário,
 * a classificação do resultado e, principalmente, a redação do que pode ir para o banco.
 */

export const EXTERNAL_SERVICES = ["open_meteo", "nominatim", "openai", "telegram", "google_oauth", "google_drive"] as const;
export type ExternalService = (typeof EXTERNAL_SERVICES)[number];

/**
 * ok: resposta 2xx e tratada sem erro · http_error: status fora de 2xx · timeout: estourou o prazo ·
 * network_error: não chegou ao servidor (DNS, conexão, TLS) · invalid_response: 2xx, mas o conteúdo não serviu.
 */
export const EXTERNAL_OUTCOMES = ["ok", "http_error", "timeout", "network_error", "invalid_response"] as const;
export type ExternalOutcome = (typeof EXTERNAL_OUTCOMES)[number];

/** Uma tentativa de chamada, já sem segredos, pronta para gravar. */
export interface ExternalCallRecord {
  startedAt: Date;
  service: ExternalService;
  /** Nome lógico da operação, ex.: "forecast.daily", "files.upload" */
  operation: string;
  method: string;
  host: string;
  path: string;
  query: string | null;
  outcome: ExternalOutcome;
  status: number | null;
  /** Do início da chamada até o fim do tratamento da resposta */
  durationMs: number;
  /** Do início até os headers da resposta */
  ttfbMs: number | null;
  requestBytes: number | null;
  responseBytes: number | null;
  attempt: number;
  errorCode: string | null;
  errorExcerpt: string | null;
  requestId: string | null;
  /** "http", "scheduler:clima"... */
  origin: string | null;
  userId: string | null;
  meta: Record<string, unknown>;
}

export const REDACTED = "[redigido]";
export const ERROR_EXCERPT_MAX = 500;
export const META_MAX_CHARS = 4_000;

// ─── Redação ─────────────────────────────────────────────────────────────────

/** Parâmetros de query que podem ser gravados, por serviço. O que não está na lista é descartado. */
const QUERY_ALLOWLIST: Record<ExternalService, readonly string[]> = {
  open_meteo: ["latitude", "longitude", "start_date", "end_date", "timezone", "daily", "hourly"],
  nominatim: ["lat", "lon", "format", "zoom", "addressdetails", "accept-language"],
  // OpenAI, Telegram e Google: nada da query vale o risco (códigos do OAuth, buscas por nome de pasta)
  openai: [],
  telegram: [],
  google_oauth: [],
  google_drive: [],
};

/** Coordenadas viram células de ~1 km: a posição exata das plantas é dado pessoal. */
const COORD_KEYS = new Set(["latitude", "longitude", "lat", "lon"]);

const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/bot\d+:[A-Za-z0-9_-]{20,}/g, `bot${REDACTED}`], // token do Telegram na URL
  [/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, `Bearer ${REDACTED}`],
  [/\bsk-[A-Za-z0-9_-]{16,}/g, REDACTED], // chave da OpenAI
  [/\bya29\.[A-Za-z0-9._-]+/g, REDACTED], // access token do Google
  [/\b1\/\/[A-Za-z0-9._-]{20,}/g, REDACTED], // refresh token do Google
  [/([?&](?:access_token|refresh_token|id_token|client_secret|api_key|apikey|key|token|code)=)[^&\s"']+/gi, `$1${REDACTED}`],
  [/("(?:access_token|refresh_token|id_token|client_secret|api_key|apiKey|botToken)"\s*:\s*)"[^"]*"/g, `$1"${REDACTED}"`],
];

/** Última barreira: tira de qualquer texto os formatos conhecidos de segredo. */
export function scrubSecrets(text: string): string {
  return SECRET_PATTERNS.reduce((acc, [re, to]) => acc.replace(re, to), text);
}

const roundCoord = (v: string): string => {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(2) : REDACTED;
};

export interface RedactedUrl {
  host: string;
  path: string;
  query: string | null;
}

/** Devolve host, caminho e query seguros para gravar. Nunca lança: URL inválida vira host vazio. */
export function redactUrl(service: ExternalService, input: string | URL): RedactedUrl {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return { host: "", path: scrubSecrets(String(input)).slice(0, 200), query: null };
  }
  let path = url.pathname;
  if (service === "telegram") path = path.replace(/^\/bot[^/]+/, `/bot${REDACTED}`);

  const allowed = QUERY_ALLOWLIST[service];
  const parts: string[] = [];
  for (const [k, v] of url.searchParams) {
    if (!allowed.includes(k)) continue;
    parts.push(`${k}=${COORD_KEYS.has(k) ? roundCoord(v) : v}`);
  }
  return { host: url.host, path: scrubSecrets(path), query: parts.length ? scrubSecrets(parts.join("&")) : null };
}

/** Trecho de uma mensagem de erro/resposta: sem segredos, sem caractere nulo, limitado. */
export function errorExcerpt(text: string, max = ERROR_EXCERPT_MAX): string {
  const clean = scrubSecrets(text).replaceAll("\u0000", "").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

/** Mantém o `meta` dentro do limite (e sem segredos conhecidos). Acima do limite, guarda só o aviso. */
export function sanitizeMeta(meta: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!meta) return {};
  const json = scrubSecrets(JSON.stringify(meta)).replaceAll("\\u0000", "");
  if (json.length > META_MAX_CHARS) return { truncated: true };
  return JSON.parse(json) as Record<string, unknown>;
}

// ─── Classificação ───────────────────────────────────────────────────────────

/** Nome e código curto de uma falha de fetch (o undici esconde o motivo real em `cause.code`). */
export function describeFetchError(err: unknown): { name: string; code: string; message: string } {
  if (!(err instanceof Error)) return { name: "Error", code: "unknown", message: String(err) };
  const cause = (err as { cause?: { code?: unknown } }).cause;
  const code = typeof cause?.code === "string" ? cause.code : err.name;
  return { name: err.name, code, message: err.message };
}

export function classifyOutcome(p: { status?: number | null; errorName?: string | null; invalidResponse?: boolean }): ExternalOutcome {
  if (p.errorName) return p.errorName === "TimeoutError" ? "timeout" : "network_error";
  if (p.status == null || p.status < 200 || p.status >= 300) return "http_error";
  return p.invalidResponse ? "invalid_response" : "ok";
}
