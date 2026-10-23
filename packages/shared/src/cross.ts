import { z } from "zod";
import { CROSS_SIDES, type CrossSide, type TaxonRank } from "./enums.ts";
import { type NamePart, normalizeSearch, type TaxonNode, taxonNameParts } from "./taxonomy.ts";

/**
 * Cruza: a planta é determinada por um táxon do catálogo OU por uma cruza (semente × pólen),
 * nunca pelos dois. Grex registrado é táxon; a cruza é para o que não tem nome no catálogo.
 * Ver docs/estudos/cruza-no-tombamento.md.
 */

export const CROSS_SIDE_LABEL: Record<CrossSide, string> = { seed: "a semente", pollen: "o pólen" };

/** Título de uma cruza com os dois parentais desconhecidos. */
export const UNNAMED_CROSS = "Cruza sem nome";
export const UNKNOWN_PARENTS = "parentais desconhecidos";

/** Um lado da cruza na entrada: um táxon do catálogo, um nome livre ou null (desconhecido). */
export const crossSideInputSchema = z
  .union([z.object({ taxonId: z.string().uuid() }).strict(), z.object({ text: z.string().trim().min(1).max(160) }).strict()])
  .nullable();
export type CrossSideInput = z.infer<typeof crossSideInputSchema>;

export const crossInputSchema = z
  .object({
    seed: crossSideInputSchema,
    pollen: crossSideInputSchema,
    /** De qual parental vem a ficha de cultivo; só um lado que está no catálogo */
    careFrom: z.enum(CROSS_SIDES).nullish(),
  })
  .refine((c) => !c.careFrom || (c[c.careFrom] && "taxonId" in c[c.careFrom]!), {
    message: "A ficha só pode vir de um parental que está no catálogo.",
    path: ["careFrom"],
  });
export type CrossInput = z.infer<typeof crossInputSchema>;

/** Lado de uma cruza para exibir: a linhagem do táxon, o texto livre ou null. */
export type CrossSideName = { lineage: readonly TaxonNode[] } | { text: string } | null;

const sideParts = (side: CrossSideName): NamePart[] => {
  if (side && "lineage" in side) return taxonNameParts(side.lineage);
  if (side && "text" in side) return [{ text: side.text, italic: true }];
  return [{ text: "?", italic: false }];
};

/**
 * Fórmula "semente × pólen" com o estilo de cada parte: cada táxon como em `taxonNameParts`,
 * nome livre em itálico, desconhecido como "?". Os dois desconhecidos: "parentais desconhecidos".
 */
export function crossNameParts(seed: CrossSideName, pollen: CrossSideName): NamePart[] {
  if (!seed && !pollen) return [{ text: UNKNOWN_PARENTS, italic: false }];
  return [...sideParts(seed), { text: " × ", italic: false }, ...sideParts(pollen)].reduce<NamePart[]>((out, p) => {
    const last = out.at(-1);
    if (last && last.italic === p.italic) last.text += p.text;
    else out.push({ ...p });
    return out;
  }, []);
}

export const crossFormula = (seed: CrossSideName, pollen: CrossSideName) =>
  crossNameParts(seed, pollen)
    .map((p) => p.text)
    .join("");

/** O que a regra da ficha precisa de uma cruza: os táxons de cada lado e o lado marcado. */
export interface CrossCareRef {
  seedTaxonId: string | null;
  pollenTaxonId: string | null;
  careFrom: CrossSide | null;
}

/** O parental de onde vem a ficha: o marcado ou, sem marca, o do catálogo que houver (a semente primeiro). */
export function careParent(cross: CrossCareRef): { side: CrossSide; taxonId: string; choosable: boolean } | null {
  const ids = { seed: cross.seedTaxonId, pollen: cross.pollenTaxonId };
  const inCatalog = CROSS_SIDES.filter((s) => ids[s]);
  const side = cross.careFrom && ids[cross.careFrom] ? cross.careFrom : inCatalog[0];
  return side ? { side, taxonId: ids[side]!, choosable: inCatalog.length === 2 } : null;
}

/** Um nó da linhagem do táxon da planta, com o que a regra da ficha precisa. */
export interface CareLineageNode {
  id: string;
  rank: TaxonRank;
  /** Preencheu algum campo da ficha (`hasOwnCare`) */
  hasCare: boolean;
  /** Parentais do grex no catálogo (`taxa.cross_id`) */
  cross: CrossCareRef | null;
}

/** De onde vem a ficha da planta: o táxon cuja ficha efetiva vale e, se vier de um parental, qual. */
export interface CareSource {
  taxonId: string;
  side: CrossSide | null;
  /** O grex cujos parentais deram a ficha, quando a planta é de um grex */
  grexId: string | null;
}

const GREX_LEVEL = new Set<TaxonRank>(["hybrid", "cultivar"]);

/**
 * careSource: a mesma regra para a cruza da planta e a do grex.
 * - Com cruza: o parental marcado → o do catálogo que houver → sem ficha.
 * - Com táxon: ficha própria do táxon até o grex (cultivar, grex) → parental marcado da cruza do
 *   grex → o próprio táxon, herdando da linhagem como sempre (`inheritCare`).
 */
export function careSource(plant: { lineage: readonly CareLineageNode[] | null; cross: CrossCareRef | null }): CareSource | null {
  if (plant.cross) {
    const p = careParent(plant.cross);
    return p ? { taxonId: p.taxonId, side: p.side, grexId: null } : null;
  }
  const self = plant.lineage?.at(-1);
  if (!self) return null;
  for (let i = plant.lineage!.length - 1; i >= 0; i--) {
    const t = plant.lineage![i]!;
    if (!GREX_LEVEL.has(t.rank)) break;
    if (t.hasCare) return { taxonId: self.id, side: null, grexId: null };
  }
  const grex = plant.lineage!.find((t) => t.rank === "hybrid" && t.cross);
  const p = grex && careParent(grex.cross!);
  if (p) return { taxonId: p.taxonId, side: p.side, grexId: grex.id };
  return { taxonId: self.id, side: null, grexId: null };
}

/** Mesmo nome, ignorando acento, caixa e pontuação: "Vanda 'Gordon Dillon'" = "Vanda Gordon Dillon". */
export const sameName = (a: string, b: string) => !!normalizeSearch(a) && normalizeSearch(a) === normalizeSearch(b);

/**
 * receivedNameMatch: o texto (da etiqueta ou de um parental) é exatamente um táxon do catálogo
 * mais específico que o atual (ou não há atual)? Então vale sugerir a troca. Nunca troca sozinho.
 */
export function receivedNameMatch<T extends { id: string; fullName: string; lineage: readonly { id: string }[] }>(
  text: string | null | undefined,
  candidates: readonly T[],
  currentTaxonId: string | null = null,
): T | null {
  if (!text) return null;
  const hit = candidates.find((t) => sameName(t.fullName, text));
  if (!hit || hit.id === currentTaxonId) return null;
  if (currentTaxonId && !hit.lineage.some((t) => t.id === currentTaxonId)) return null;
  return hit;
}
