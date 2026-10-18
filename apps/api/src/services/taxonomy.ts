import { eq, inArray, sql } from "drizzle-orm";
import { inheritCare, resolveOrigin, taxonFullName, taxonSearchText, type TaxonOrigin, type TaxonRank } from "@orchidiary/shared";
import { db, schema } from "../db/client.ts";

const { taxa } = schema;

export type Taxon = typeof taxa.$inferSelect;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = typeof db | Tx;

/** O que o app precisa para mostrar um táxon e o caminho até ele. */
export interface TaxonRef {
  id: string;
  rank: TaxonRank;
  name: string;
  fullName: string;
}

export interface TaxonSummary extends TaxonRef {
  commonNames: string[];
  /** País, cruzamento ou desconhecida: a do táxon ou, se ele não informou, a do ancestral mais próximo */
  origin: TaxonOrigin;
  /** Raiz → táxon, incluindo ele mesmo */
  lineage: TaxonRef[];
}

export const toRef = (t: Taxon): TaxonRef => ({ id: t.id, rank: t.rank, name: t.name, fullName: t.fullName });

/** Linhagem (raiz → táxon) de cada id pedido, com uma consulta recursiva só. */
export async function lineagesOf(ids: readonly string[], tx: Executor = db): Promise<Map<string, Taxon[]>> {
  const wanted = [...new Set(ids)];
  if (!wanted.length) return new Map();
  const steps = await tx.execute<{ start_id: string; id: string; depth: number }>(sql`
    with recursive up(start_id, id, parent_id, depth) as (
      select id, id, parent_id, 0 from taxa
      where id in (${sql.join(
        wanted.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})
      union all
      -- o limite de profundidade protege contra um ciclo que escape da validação
      select up.start_id, t.id, t.parent_id, up.depth + 1 from taxa t join up on t.id = up.parent_id where up.depth < 32
    )
    select start_id, id, depth from up order by start_id, depth desc
  `);
  const rows = await tx
    .select()
    .from(taxa)
    .where(inArray(taxa.id, [...new Set(steps.map((s) => s.id))]));
  const byId = new Map(rows.map((t) => [t.id, t]));
  const out = new Map<string, Taxon[]>();
  for (const step of steps) {
    const t = byId.get(step.id);
    if (!t) continue;
    const chain = out.get(step.start_id) ?? [];
    chain.push(t);
    out.set(step.start_id, chain);
  }
  return out;
}

export async function summariesOf(ids: readonly (string | null)[], tx: Executor = db) {
  const lineages = await lineagesOf(ids.filter((id): id is string => !!id), tx);
  const out = new Map<string, TaxonSummary>();
  for (const [id, chain] of lineages) {
    const self = chain.at(-1)!;
    out.set(id, { ...toRef(self), commonNames: self.commonNames, origin: resolveOrigin(chain), lineage: chain.map(toRef) });
  }
  return out;
}

/** Ficha efetiva de cada táxon, herdando dos ancestrais o que ele não preencheu. */
export async function effectiveCareOf(ids: readonly string[], tx: Executor = db) {
  const lineages = await lineagesOf(ids, tx);
  return new Map([...lineages].map(([id, chain]) => [id, inheritCare(chain)]));
}

/**
 * Recalcula full_name e search_text de todo o catálogo a partir da árvore.
 * Barato (o catálogo tem alguns milhares de linhas) e só grava o que mudou;
 * roda depois de renomear ou mover um táxon e no fim do seed.
 */
export async function refreshDerivedNames(tx: Executor = db) {
  const all = await tx
    .select({
      id: taxa.id,
      parentId: taxa.parentId,
      rank: taxa.rank,
      name: taxa.name,
      fullName: taxa.fullName,
      searchText: taxa.searchText,
      commonNames: taxa.commonNames,
    })
    .from(taxa);
  const byId = new Map(all.map((t) => [t.id, t]));
  let changed = 0;
  for (const t of all) {
    const chain = [];
    const seen = new Set<string>();
    for (let cur: typeof t | undefined = t; cur && !seen.has(cur.id); cur = cur.parentId ? byId.get(cur.parentId) : undefined) {
      seen.add(cur.id);
      chain.unshift(cur);
    }
    const fullName = taxonFullName(chain);
    const searchText = taxonSearchText(fullName, t.commonNames);
    if (fullName !== t.fullName || searchText !== t.searchText) {
      await tx.update(taxa).set({ fullName, searchText }).where(eq(taxa.id, t.id));
      changed++;
    }
  }
  return changed;
}
