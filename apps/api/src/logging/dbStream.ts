import { db, schema } from "../db/client.ts";
import { type LogRow, toLogRow } from "./logRow.ts";

const FLUSH_EVERY_MS = 3_000;
const BATCH_SIZE = 50;
const MAX_BUFFER = 1_000;
const WARN_EVERY_MS = 60_000;

/**
 * Stream do pino que grava warn/error/fatal e auditoria em app_logs, em lotes.
 * Nunca derruba nada: se o banco estiver fora, mantém um buffer limitado e tenta de novo.
 * Falhas vão para o stderr (e não para o logger) para não gerar um ciclo.
 */
export class DbLogStream {
  private buffer: LogRow[] = [];
  private flushing: Promise<void> | null = null;
  private lastWarnAt = 0;
  private dropped = 0;
  private readonly timer: NodeJS.Timeout;

  constructor() {
    this.timer = setInterval(() => void this.flush(), FLUSH_EVERY_MS);
    this.timer.unref();
  }

  /** Chamado pelo pino com uma linha JSON. */
  write(line: string): void {
    const row = toLogRow(line);
    if (!row) return;
    this.buffer.push(row);
    if (this.buffer.length > MAX_BUFFER) {
      const excess = this.buffer.length - MAX_BUFFER;
      this.buffer.splice(0, excess);
      this.dropped += excess;
    }
    if (this.buffer.length >= BATCH_SIZE) void this.flush();
  }

  /** Grava o que estiver pendente. Seguro chamar várias vezes ao mesmo tempo. */
  flush(): Promise<void> {
    this.flushing ??= this.drain().finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }

  private async drain(): Promise<void> {
    while (this.buffer.length > 0) {
      const batch = this.buffer.splice(0, BATCH_SIZE);
      try {
        await db.insert(schema.appLogs).values(batch);
      } catch (e) {
        // devolve o lote ao início do buffer e tenta no próximo ciclo
        this.buffer.unshift(...batch);
        if (this.buffer.length > MAX_BUFFER) {
          this.dropped += this.buffer.length - MAX_BUFFER;
          this.buffer.length = MAX_BUFFER;
        }
        this.warn(e);
        return;
      }
    }
    if (this.dropped > 0) {
      process.stderr.write(`[logger] ${this.dropped} logs descartados do buffer do banco (limite de ${MAX_BUFFER}).\n`);
      this.dropped = 0;
    }
  }

  private warn(e: unknown) {
    const now = Date.now();
    if (now - this.lastWarnAt < WARN_EVERY_MS) return;
    this.lastWarnAt = now;
    process.stderr.write(`[logger] falha ao gravar app_logs (${this.buffer.length} pendentes): ${e instanceof Error ? e.message : e}\n`);
  }
}
