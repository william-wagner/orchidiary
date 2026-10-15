import { and, asc, eq, like, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import {
  canBeChildOf,
  hasOwnCare,
  normalizeSearch,
  TAXON_RANKS,
  type TaxonInput,
  taxonFullName,
  taxonInputSchema,
  taxonNameError,
  taxonSearchText,
} from "@orchidiary/shared";
import { db, schema } from "../db/client.ts";
import { type AppEnv, requireMaster, requireUser } from "../auth/session.ts";
import { zValidator } from "../lib/validate.ts";
import { effectiveCareOf, lineagesOf, refreshDerivedNames, summariesOf, type Taxon, toRef } from "../services/taxonomy.ts";

const { taxa } = schema;
const rankOrder = (r: Taxon["rank"]) => TAXON_RANKS.indexOf(r);

/** Táxons que preencheram ao menos um campo da ficha (lista inicial do Guia). */
const ownCareSql = sql`(
  coalesce(${taxa.tempDayMin}, ${taxa.tempDayMax}, ${taxa.tempNightMin}, ${taxa.tempNightMax}, ${taxa.humidityMin}, ${taxa.humidityMax}) is not null
  or coalesce(${taxa.light}, ${taxa.watering}, ${taxa.fertilizing}, ${taxa.substrate}, ${taxa.restPeriod}) is not null
  or cardinality(${taxa.bloomMonths}) > 0
)`;

const isUniqueViolation = (e: unknown) => {
  const err = e as { code?: string; cause?: { code?: string } };
  return err?.code === "23505" || err?.cause?.code === "23505";
};

/**
 * Confere o lugar do táxon na árvore e devolve o nome completo e o texto de busca.
 * `selfId` é o táxon sendo editado: o novo pai não pode ser ele nem um descendente dele.
 */
async function placement(input: TaxonInput, selfId?: string) {
  const nameError = taxonNameError(input.rank, input.name);
  if (nameError) return { error: nameError };
  const parentLineage = input.parentId ? (await lineagesOf([input.parentId])).get(input.parentId) : [];
  if (!parentLineage) return { error: "O táxon acima não existe." };
  const parent = parentLineage.at(-1);
  if (selfId && parentLineage.some((t) => t.id === selfId)) {
    return { error: "Um táxon não pode ficar abaixo dele mesmo." };
  }
  if (!canBeChildOf(input.rank, parent?.rank ?? null)) {
    return {
      error: parent
        ? `Esse nível não pode ficar abaixo de ${parent.fullName}.`
        : "Espécies, variedades, híbridos e cultivares precisam de um táxon acima.",
    };
  }
  const fullName = taxonFullName([...parentLineage, { rank: input.rank, name: input.name }]);
  return { fullName, searchText: taxonSearchText(fullName, input.commonNames) };
}

/** Guia de Cultivo: leitura para todos; edição só pelo master (por enquanto). */
export const taxaRoutes = new Hono<AppEnv>()
  .use(requireUser)

  // Sem q: táxons com ficha própria. Com q: busca no catálogo inteiro, palavra por palavra
  .get(
    "/",
    zValidator("query", z.object({ q: z.string().max(120).optional(), limit: z.coerce.number().int().min(1).max(100).default(20) })),
    async (c) => {
      const { q, limit } = c.req.valid("query");
      const needle = normalizeSearch(q ?? "");
      const tokens = needle.split(" ").filter(Boolean);
      // normalizeSearch só deixa [a-z0-9 ], então não sobra % nem _ para escapar
      let rows = tokens.length
        ? await db
            .select()
            .from(taxa)
            .where(and(...tokens.map((t) => like(taxa.searchText, `%${t}%`))))
            .orderBy(
              sql`(${taxa.searchText} like ${`${needle}%`}) desc`,
              sql`(${taxa.searchText} like ${`% ${needle}%`}) desc`,
              sql`length(${taxa.fullName})`,
              asc(taxa.fullName),
            )
            .limit(limit)
        : await db.select().from(taxa).where(ownCareSql).orderBy(asc(taxa.fullName));
      // nada exato: tenta por semelhança (pg_trgm), para erros de grafia como "Bulbophyllium"
      if (!rows.length && needle.length >= 4) {
        rows = await db
          .select()
          .from(taxa)
          .where(sql`word_similarity(${needle}, ${taxa.searchText}) >= 0.5`)
          .orderBy(sql`word_similarity(${needle}, ${taxa.searchText}) desc`, sql`length(${taxa.fullName})`)
          .limit(limit);
      }
      const summaries = await summariesOf(rows.map((r) => r.id));
      return c.json(rows.map((r) => ({ ...summaries.get(r.id)!, hasCare: hasOwnCare(r) })));
    },
  )

  .get("/:id", async (c) => {
    const id = c.req.param("id");
    if (!z.string().uuid().safeParse(id).success) return c.notFound();
    const lineage = (await lineagesOf([id])).get(id);
    if (!lineage) return c.notFound();
    const self = lineage.at(-1)!;
    const [children, careMap] = await Promise.all([
      db.select().from(taxa).where(eq(taxa.parentId, id)),
      effectiveCareOf([id]),
    ]);
    const { searchText: _, ...row } = self;
    const effective = careMap.get(id)!;
    return c.json({
      ...row,
      hasCare: hasOwnCare(self),
      lineage: lineage.map(toRef),
      children: children
        .sort((a, b) => rankOrder(a.rank) - rankOrder(b.rank) || a.name.localeCompare(b.name))
        .map((t) => ({ ...toRef(t), hasCare: hasOwnCare(t) })),
      care: effective.care,
      careSources: effective.sources,
    });
  })

  .post("/", requireMaster, zValidator("json", taxonInputSchema), async (c) => {
    const input = c.req.valid("json");
    const place = await placement(input);
    if ("error" in place) return c.json({ error: place.error }, 400);
    try {
      const [row] = await db.insert(taxa).values({ ...input, ...place }).returning();
      return c.json(row, 201);
    } catch (e) {
      if (isUniqueViolation(e)) return c.json({ error: "Esse táxon já está no catálogo." }, 409);
      throw e;
    }
  })

  .put("/:id", requireMaster, zValidator("json", taxonInputSchema), async (c) => {
    const id = c.req.param("id");
    if (!z.string().uuid().safeParse(id).success) return c.notFound();
    const input = c.req.valid("json");
    const place = await placement(input, id);
    if ("error" in place) return c.json({ error: place.error }, 400);
    const children = await db.select({ rank: taxa.rank, fullName: taxa.fullName }).from(taxa).where(eq(taxa.parentId, id));
    const orphan = children.find((child) => !canBeChildOf(child.rank, input.rank));
    if (orphan) return c.json({ error: `${orphan.fullName} não pode ficar abaixo desse nível.` }, 409);
    try {
      const row = await db.transaction(async (tx) => {
        const [updated] = await tx
          .update(taxa)
          .set({ ...input, ...place, updatedAt: new Date() })
          .where(eq(taxa.id, id))
          .returning();
        // nome ou pai mudou: os descendentes mudam de nome junto
        if (updated) await refreshDerivedNames(tx);
        return updated;
      });
      return row ? c.json(row) : c.notFound();
    } catch (e) {
      if (isUniqueViolation(e)) return c.json({ error: "Esse táxon já está no catálogo." }, 409);
      throw e;
    }
  });
