const FLUSH_EVERY_MS = 3_000;
const BATCH_SIZE = 50;
const MAX_BUFFER = 1_000;
const WARN_EVERY_MS = 60_000;

export interface BatchWriterOptions<T> {
  /** Nome da tabela/fila, usado nas mensagens do stderr */
  label: string;
  /** Grava um lote. Se lançar, o lote volta ao início do buffer e é tentado no próximo ciclo. */
  insert: (rows: T[]) => Promise<void>;
  flushEveryMs?: number;
  batchSize?: number;
  maxBuffer?: number;
}

/**
 * Fila em memória que grava no banco em lotes (app_logs, external_calls).
 * Nunca derruba nada: se o banco estiver fora, mantém um buffer limitado (descartando os mais antigos)
 * e tenta de novo. Falhas vão para o stderr, e não para o logger, para não gerar um ciclo.
 */
export class BatchWriter<T> {
  private buffer: T[] = [];
  private flushing: Promise<void> | null = null;
  private lastWarnAt = 0;
  private dropped = 0;
  private readonly flushEveryMs: number;
  private readonly batchSize: number;
  private readonly maxBuffer: number;
  private readonly timer: NodeJS.Timeout;

  constructor(private readonly opts: BatchWriterOptions<T>) {
    this.flushEveryMs = opts.flushEveryMs ?? FLUSH_EVERY_MS;
    this.batchSize = opts.batchSize ?? BATCH_SIZE;
    this.maxBuffer = opts.maxBuffer ?? MAX_BUFFER;
    this.timer = setInterval(() => void this.flush(), this.flushEveryMs);
    this.timer.unref();
  }

  /** Quantos itens aguardam gravação. */
  get pending(): number {
    return this.buffer.length;
  }

  push(row: T): void {
    this.buffer.push(row);
    if (this.buffer.length > this.maxBuffer) {
      const excess = this.buffer.length - this.maxBuffer;
      this.buffer.splice(0, excess);
      this.dropped += excess;
    }
    if (this.buffer.length >= this.batchSize) void this.flush();
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
      const batch = this.buffer.splice(0, this.batchSize);
      try {
        await this.opts.insert(batch);
      } catch (e) {
        // devolve o lote ao início do buffer e tenta no próximo ciclo
        this.buffer.unshift(...batch);
        if (this.buffer.length > this.maxBuffer) {
          this.dropped += this.buffer.length - this.maxBuffer;
          this.buffer.length = this.maxBuffer;
        }
        this.warn(e);
        return;
      }
    }
    if (this.dropped > 0) {
      process.stderr.write(`[logger] ${this.dropped} registros descartados do buffer de ${this.opts.label} (limite de ${this.maxBuffer}).\n`);
      this.dropped = 0;
    }
  }

  private warn(e: unknown) {
    const now = Date.now();
    if (now - this.lastWarnAt < WARN_EVERY_MS) return;
    this.lastWarnAt = now;
    process.stderr.write(`[logger] falha ao gravar ${this.opts.label} (${this.buffer.length} pendentes): ${e instanceof Error ? e.message : e}\n`);
  }
}
