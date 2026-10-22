import {
  classifyOutcome,
  describeFetchError,
  type ExternalCallRecord,
  type ExternalService,
  errorExcerpt,
  redactUrl,
  sanitizeMeta,
} from "@orchidiary/shared";
import { currentContext } from "./context.ts";

/**
 * Cliente HTTP que registra cada chamada a um serviço externo.
 * Não importa o banco: quem grava é o `sink` (ver recorder.ts), o que deixa o wrapper testável.
 */

export interface CallSink {
  record(row: ExternalCallRecord): void;
}

export interface CallSpec {
  /** Nome lógico da operação, ex.: "forecast.daily" */
  operation: string;
  url: string | URL;
  init?: RequestInit;
  /** Detalhes que valem guardar (sem segredos; passam por sanitizeMeta de qualquer forma) */
  meta?: Record<string, unknown>;
}

export interface CallScope {
  /** Acrescenta detalhes só conhecidos depois da resposta (ex.: uso de tokens) */
  annotate(meta: Record<string, unknown>): void;
}

export interface HttpClient {
  readonly service: ExternalService;
  /**
   * Faz a requisição e entrega a resposta ao `handler`, que lê o corpo e devolve o resultado.
   * A chamada só é registrada depois do handler, então a duração cobre também a leitura do corpo.
   * O handler deve lançar erro quando a resposta não servir: com status 2xx vira `invalid_response`,
   * com outro status, `http_error`. O erro é sempre relançado, sem alteração.
   */
  call<T>(spec: CallSpec, handler: (res: Response, scope: CallScope) => Promise<T>): Promise<T>;
}

export interface HttpClientOptions {
  service: ExternalService;
  sink: CallSink;
  /** Troque nos testes */
  baseFetch?: typeof fetch;
}

/** Quanto esperar pelo corpo de uma resposta de erro, só para guardar o trecho. */
const ERROR_BODY_WAIT_MS = 2_000;
const BODY_READ_LIMIT = 4_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function requestBodySize(body: RequestInit["body"]): number | null {
  if (body == null) return 0;
  if (typeof body === "string") return Buffer.byteLength(body);
  if (body instanceof URLSearchParams) return Buffer.byteLength(body.toString());
  if (body instanceof Blob) return body.size;
  if (ArrayBuffer.isView(body) || body instanceof ArrayBuffer) return body.byteLength;
  if (body instanceof FormData) {
    let total = 0;
    for (const [k, v] of body) total += Buffer.byteLength(k) + (typeof v === "string" ? Buffer.byteLength(v) : v.size);
    return total;
  }
  return null; // stream: tamanho desconhecido
}

async function readErrorBody(res: Response): Promise<string | null> {
  try {
    const text = await Promise.race([
      res.text(),
      new Promise<null>((r) => setTimeout(() => r(null), ERROR_BODY_WAIT_MS).unref()),
    ]);
    return text == null ? null : text.slice(0, BODY_READ_LIMIT);
  } catch {
    return null;
  }
}

export function createHttpClient({ service, sink, baseFetch = fetch }: HttpClientOptions): HttpClient {
  return {
    service,
    async call<T>(spec: CallSpec, handler: (res: Response, scope: CallScope) => Promise<T>): Promise<T> {
      const startedAt = new Date();
      const t0 = performance.now();
      const annotations: Record<string, unknown> = {};
      const scope: CallScope = { annotate: (meta) => Object.assign(annotations, meta) };

      let res: Response | undefined;
      let errorBody: Promise<string | null> | undefined;
      let ttfbMs: number | null = null;
      let thrown: unknown;
      let failed = false;

      try {
        res = await baseFetch(spec.url, spec.init);
        ttfbMs = Math.round(performance.now() - t0);
        // cópia só para as respostas de erro: guardar o motivo dado pelo serviço
        if (!res.ok) errorBody = readErrorBody(res.clone());
        return await handler(res, scope);
      } catch (e) {
        failed = true;
        thrown = e;
        throw e;
      } finally {
        // registrar nunca pode atrapalhar a chamada
        try {
          const durationMs = Math.round(performance.now() - t0);
          const status = res?.status ?? null;
          const fetchFailed = failed && !res;
          const err = failed ? describeFetchError(thrown) : null;
          const timedOut = err?.name === "TimeoutError";
          const outcome = classifyOutcome({
            status,
            errorName: fetchFailed || timedOut ? err!.name : null,
            invalidResponse: failed && !timedOut,
          });

          let errorCode: string | null = null;
          let excerpt: string | null = null;
          if (outcome !== "ok") {
            errorCode = fetchFailed || timedOut ? err!.code : outcome === "http_error" ? `HTTP_${status}` : err?.name ?? null;
            const body = errorBody ? await errorBody : null;
            excerpt = errorExcerpt(body || err?.message || "") || null;
          }

          const redacted = redactUrl(service, spec.url);
          const ctx = currentContext();
          const contentLength = Number(res?.headers.get("content-length"));
          sink.record({
            startedAt,
            service,
            operation: spec.operation,
            method: (spec.init?.method ?? "GET").toUpperCase(),
            host: redacted.host,
            path: redacted.path,
            query: redacted.query,
            outcome,
            status,
            durationMs,
            ttfbMs,
            requestBytes: requestBodySize(spec.init?.body),
            responseBytes: Number.isFinite(contentLength) && res?.headers.has("content-length") ? contentLength : null,
            attempt: 1,
            errorCode,
            errorExcerpt: excerpt,
            requestId: ctx?.requestId ?? null,
            origin: ctx?.origin ?? null,
            userId: ctx?.userId && UUID.test(ctx.userId) ? ctx.userId : null,
            meta: sanitizeMeta({ ...spec.meta, ...annotations }),
          });
        } catch {
          // ignorado de propósito
        }
      }
    },
  };
}
