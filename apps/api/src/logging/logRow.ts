/**
 * Converte uma linha JSON do pino em linha da tabela app_logs.
 * Função pura (sem banco) para ser testada isoladamente.
 */

export interface LogRow {
  createdAt: Date;
  level: string;
  source: string;
  message: string;
  requestId: string | null;
  userId: string | null;
  context: Record<string, unknown>;
  errorStack: string | null;
}

const LEVEL_WARN = 40;
const LEVEL_NAMES: Record<number, string> = { 40: "warn", 50: "error", 60: "fatal" };
const MAX_MESSAGE = 2_000;
const MAX_STACK = 8_000;
const MAX_CONTEXT = 16_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Campos que já têm coluna própria (ou são ruído do pino) e não entram no contexto. */
const RESERVED = new Set(["level", "time", "pid", "hostname", "msg", "source", "requestId", "userId", "err", "audit"]);

// Postgres rejeita o caractere nulo em text e jsonb
const clean = (s: string) => s.replaceAll("\u0000", "");
const cut = (s: string, max: number) => (s.length > max ? `${s.slice(0, max)}…` : s);

/**
 * Devolve a linha a gravar, ou null quando o registro não vai para a tabela:
 * só entram warn/error/fatal e eventos de auditoria (`audit: true`).
 */
export function toLogRow(line: string): LogRow | null {
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof obj !== "object" || obj === null) return null;

  const levelNum = typeof obj.level === "number" ? obj.level : 30;
  const isAudit = obj.audit === true;
  if (!isAudit && levelNum < LEVEL_WARN) return null;

  const err = (typeof obj.err === "object" && obj.err !== null ? obj.err : null) as
    | { message?: unknown; stack?: unknown; type?: unknown }
    | null;

  const context: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (!RESERVED.has(k)) context[k] = v;
  if (typeof err?.type === "string") context.errorType = err.type;
  if (typeof obj.userId === "string" && !UUID.test(obj.userId)) context.userId = obj.userId;

  const serialized = clean(JSON.stringify(context));
  const ctx: Record<string, unknown> =
    serialized.length > MAX_CONTEXT ? { truncated: true, preview: serialized.slice(0, 2_000) } : JSON.parse(serialized);

  const message =
    (typeof obj.msg === "string" && obj.msg) || (typeof err?.message === "string" && err.message) || "(sem mensagem)";

  return {
    createdAt: new Date(typeof obj.time === "number" ? obj.time : Date.now()),
    level: isAudit ? "audit" : (LEVEL_NAMES[levelNum] ?? "error"),
    source: typeof obj.source === "string" && obj.source ? obj.source : "app",
    message: cut(clean(message), MAX_MESSAGE),
    requestId: typeof obj.requestId === "string" ? obj.requestId : null,
    userId: typeof obj.userId === "string" && UUID.test(obj.userId) ? obj.userId : null,
    context: ctx,
    errorStack: typeof err?.stack === "string" ? cut(clean(err.stack), MAX_STACK) : null,
  };
}
