import { and, eq, inArray, notExists } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import {
  type CareLineageNode,
  careSource,
  type CrossCareRef,
  type CrossInput,
  crossFormula,
  type CrossSide,
  type CrossSideName,
  hasOwnCare,
  UNNAMED_CROSS,
} from "@orchidiary/shared";
import { db, schema } from "../db/client.ts";
import { lineagesOf, summariesOf, type TaxonSummary } from "./taxonomy.ts";

const { crosses, plants, taxa } = schema;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = typeof db | Tx;
type CrossRow = typeof crosses.$inferSelect;

/** Um lado já resolvido para o app: o táxon (com linhagem e origem), o nome livre ou null. */
export type CrossSideView = { taxon: TaxonSummary } | { text: string } | null;

export interface PlantCross {
  id: string;
  /** "plant": cruza da própria planta; "taxon": parentais do grex, vindos do catálogo (só leitura) */
  source: "plant" | "taxon";
  seed: CrossSideView;
  pollen: CrossSideView;
  careFrom: CrossSide | null;
}

/** De onde vem a ficha da planta (ver `careSource`, no shared). */
export interface PlantCare {
  /** Táxon cuja ficha efetiva vale para a planta */
  taxonId: string;
  fullName: string;
  /** Quando a ficha vem de um parental: qual lado */
  side: CrossSide | null;
  /** Quando vem de um parental do grex: o grex */
  grexId: string | null;
}

export interface PlantIdentity {
  taxon: TaxonSummary | null;
  cross: PlantCross | null;
  care: PlantCare | null;
  /** Nome em texto corrido: o táxon, a fórmula da cruza ou null (aí vale o nome recebido) */
  name: string | null;
}

const careRef = (c: CrossRow): CrossCareRef => ({ seedTaxonId: c.seedTaxonId, pollenTaxonId: c.pollenTaxonId, careFrom: c.careFrom });

/**
 * Táxon, cruza e fonte da ficha de cada planta, com poucas consultas. A API devolve isso
 * resolvido: o app nunca decide de onde vêm os parentais nem a ficha.
 */
export async function identitiesOf(
  rows: readonly { id: string; taxonId: string | null; crossId: string | null }[],
  tx: Executor = db,
): Promise<Map<string, PlantIdentity>> {
  const lineages = await lineagesOf(rows.map((r) => r.taxonId).filter((id): id is string => !!id), tx);
  const grexCrossIds = [...lineages.values()].flatMap((chain) => chain.filter((t) => t.rank === "hybrid" && t.crossId).map((t) => t.crossId!));
  const crossIds = [...new Set([...rows.map((r) => r.crossId).filter((id): id is string => !!id), ...grexCrossIds])];
  const crossRows = crossIds.length ? await tx.select().from(crosses).where(inArray(crosses.id, crossIds)) : [];
  const crossBy = new Map(crossRows.map((c) => [c.id, c]));
  const sideIds = crossRows.flatMap((c) => [c.seedTaxonId, c.pollenTaxonId]);
  const summaries = await summariesOf([...rows.map((r) => r.taxonId), ...sideIds], tx);

  const side = (taxonId: string | null, text: string | null): CrossSideView =>
    taxonId && summaries.get(taxonId) ? { taxon: summaries.get(taxonId)! } : text ? { text } : null;
  const sideName = (s: CrossSideView): CrossSideName => (s && "taxon" in s ? { lineage: s.taxon.lineage } : s);

  const out = new Map<string, PlantIdentity>();
  for (const r of rows) {
    const chain = r.taxonId ? (lineages.get(r.taxonId) ?? null) : null;
    const own = r.crossId ? crossBy.get(r.crossId) : undefined;
    const grex = chain?.find((t) => t.rank === "hybrid" && t.crossId && crossBy.has(t.crossId));
    const row = own ?? (grex ? crossBy.get(grex.crossId!) : undefined);
    const cross: PlantCross | null = row
      ? {
          id: row.id,
          source: own ? "plant" : "taxon",
          seed: side(row.seedTaxonId, row.seedText),
          pollen: side(row.pollenTaxonId, row.pollenText),
          careFrom: row.careFrom,
        }
      : null;
    const lineage: CareLineageNode[] | null =
      chain?.map((t) => ({
        id: t.id,
        rank: t.rank,
        hasCare: hasOwnCare(t),
        cross: t.crossId && crossBy.has(t.crossId) ? careRef(crossBy.get(t.crossId)!) : null,
      })) ?? null;
    const src = careSource({ lineage, cross: own ? careRef(own) : null });
    const careTaxon = src && summaries.get(src.taxonId);
    const taxon = (r.taxonId && summaries.get(r.taxonId)) || null;
    const formula = own && (own.seedTaxonId || own.seedText || own.pollenTaxonId || own.pollenText)
      ? crossFormula(sideName(cross!.seed), sideName(cross!.pollen))
      : own
        ? UNNAMED_CROSS
        : null;
    out.set(r.id, {
      taxon,
      cross,
      care: src && careTaxon ? { taxonId: src.taxonId, fullName: careTaxon.fullName, side: src.side, grexId: src.grexId } : null,
      name: taxon?.fullName ?? formula,
    });
  }
  return out;
}

/** Confere que os táxons dos parentais existem no catálogo. */
export async function assertCrossTaxa(cross: CrossInput | null | undefined) {
  const ids = [cross?.seed, cross?.pollen].flatMap((s) => (s && "taxonId" in s ? [s.taxonId] : []));
  if (!ids.length) return;
  const found = await db.select({ id: taxa.id }).from(taxa).where(inArray(taxa.id, ids));
  if (new Set(found.map((t) => t.id)).size !== new Set(ids).size) {
    throw new HTTPException(400, { message: "Um dos parentais não está no catálogo." });
  }
}

const crossValues = (input: CrossInput) => ({
  seedTaxonId: input.seed && "taxonId" in input.seed ? input.seed.taxonId : null,
  seedText: input.seed && "text" in input.seed ? input.seed.text : null,
  pollenTaxonId: input.pollen && "taxonId" in input.pollen ? input.pollen.taxonId : null,
  pollenText: input.pollen && "text" in input.pollen ? input.pollen.text : null,
  careFrom: input.careFrom ?? null,
});

/**
 * Grava a cruza da planta: altera a que ela já usa (vale para as irmãs que dividem a mesma)
 * ou cria uma nova, da pessoa. Devolve o id para `plants.cross_id`.
 */
export async function saveCross(tx: Tx, userId: string, currentCrossId: string | null, input: CrossInput): Promise<string> {
  if (currentCrossId) {
    const [row] = await tx
      .update(crosses)
      .set({ ...crossValues(input), updatedAt: new Date() })
      .where(and(eq(crosses.id, currentCrossId), eq(crosses.userId, userId)))
      .returning({ id: crosses.id });
    if (row) return row.id;
  }
  const [row] = await tx
    .insert(crosses)
    .values({ ...crossValues(input), userId })
    .returning({ id: crosses.id });
  return row!.id;
}

/** Apaga a cruza da pessoa que ficou sem nenhuma planta e sem grex apontando para ela. */
export async function dropOrphanCross(tx: Tx, crossId: string | null) {
  if (!crossId) return;
  await tx
    .delete(crosses)
    .where(
      and(
        eq(crosses.id, crossId),
        notExists(tx.select({ id: plants.id }).from(plants).where(eq(plants.crossId, crossId))),
        notExists(tx.select({ id: taxa.id }).from(taxa).where(eq(taxa.crossId, crossId))),
      ),
    );
}
