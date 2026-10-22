import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Contexto da execução em curso: de qual requisição (ou rodada de rotina) uma chamada veio.
 * Quem abre o contexto é o requestLogger (cada requisição) e o scheduler (cada rodada); o logger e o
 * wrapper de HTTP leem dele, de modo que ninguém precisa repassar requestId por parâmetro.
 * Não importa nada do app: é usado por módulos que não podem depender do banco.
 */
export interface CallContext {
  /** X-Request-Id da requisição; nas rotinas, um id gerado para a rodada */
  requestId: string;
  /** "http", "scheduler:clima"... */
  origin: string;
  /** Preenchido quando a sessão é identificada (setContextUser) */
  userId?: string;
}

const storage = new AsyncLocalStorage<CallContext>();

export const runWithContext = <T>(ctx: CallContext, fn: () => T): T => storage.run(ctx, fn);

export const currentContext = (): CallContext | undefined => storage.getStore();

/** Chamado quando o usuário é identificado no meio da requisição. */
export function setContextUser(userId: string): void {
  const ctx = storage.getStore();
  if (ctx) ctx.userId = userId;
}
