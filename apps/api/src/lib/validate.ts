import { validator } from "hono/validator";
import type { ValidationTargets } from "hono";
import type { z } from "zod";

/**
 * Validador Zod para rotas Hono, sem depender de @hono/zod-validator.
 * Devolve 400 com os erros por campo.
 */
export function zValidator<T extends keyof ValidationTargets, S extends z.ZodType>(target: T, schema: S) {
  return validator(target, async (value, c) => {
    const result = await schema.safeParseAsync(value);
    if (!result.success) {
      return c.json({ error: "Dados inválidos.", issues: result.error.issues }, 400);
    }
    return result.data as z.output<S>;
  });
}
