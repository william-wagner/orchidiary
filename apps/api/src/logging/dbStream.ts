import { db, schema } from "../db/client.ts";
import { BatchWriter } from "./batchWriter.ts";
import { type LogRow, toLogRow } from "./logRow.ts";

/**
 * Stream do pino que grava warn/error/fatal e auditoria em app_logs, em lotes (ver BatchWriter).
 */
export class DbLogStream {
  private readonly writer = new BatchWriter<LogRow>({
    label: "app_logs",
    insert: async (rows) => {
      await db.insert(schema.appLogs).values(rows);
    },
  });

  /** Chamado pelo pino com uma linha JSON. */
  write(line: string): void {
    const row = toLogRow(line);
    if (row) this.writer.push(row);
  }

  /** Grava o que estiver pendente. */
  flush(): Promise<void> {
    return this.writer.flush();
  }
}
