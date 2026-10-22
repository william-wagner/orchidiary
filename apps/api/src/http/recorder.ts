import type { ExternalCallRecord } from "@orchidiary/shared";
import { BatchWriter } from "../logging/batchWriter.ts";
import type { CallSink } from "./client.ts";

/**
 * Grava as chamadas externas em external_calls, em lotes (ver BatchWriter).
 * O banco é carregado sob demanda para que importar os serviços (e testá-los) não exija DATABASE_URL.
 */
class ExternalCallRecorder implements CallSink {
  private readonly writer = new BatchWriter<ExternalCallRecord>({
    label: "external_calls",
    insert: async (rows) => {
      const { db, schema } = await import("../db/client.ts");
      await db.insert(schema.externalCalls).values(rows);
    },
  });

  record(row: ExternalCallRecord): void {
    this.writer.push(row);
  }

  flush(): Promise<void> {
    return this.writer.flush();
  }
}

export const externalCallRecorder = new ExternalCallRecorder();
