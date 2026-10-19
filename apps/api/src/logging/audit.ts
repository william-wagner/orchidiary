import type { Context } from "hono";
import { clientIp } from "../auth/clientIp.ts";
import { logger } from "../logger.ts";

const auditLogger = logger.child({ source: "audit" });

interface AuditOptions {
  /** Mensagem legível, em português */
  message: string;
  /** Código curto do evento, ex.: "auth.login" */
  event: string;
  /** Usuário que fez a ação (quando conhecido) */
  userId?: string;
  /** "failure" e "blocked" gravam como warn */
  outcome?: "success" | "failure" | "blocked";
  /** Detalhes extras. Nunca inclua senhas, tokens ou segredos. */
  context?: Record<string, unknown>;
}

/**
 * Registra um evento de auditoria (login, mudança de integração, backup...).
 * Vai para o arquivo e para app_logs com level "audit".
 */
export function audit(c: Context, { message, event, userId, outcome = "success", context }: AuditOptions) {
  const fields = {
    audit: true,
    event,
    outcome,
    ip: clientIp(c),
    userId: userId ?? (c.get("user") as { id?: string } | undefined)?.id,
    requestId: c.get("requestId") as string | undefined,
    ...context,
  };
  if (outcome !== "success") auditLogger.warn(fields, message);
  else auditLogger.info(fields, message);
}
