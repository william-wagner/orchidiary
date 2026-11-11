import { formatAccession } from "./dates.ts";
import { normalizeSearch } from "./taxonomy.ts";

/** O que a busca usa de um táxon: o nome completo, os populares e os níveis acima (gênero, subtribo…). */
export interface SearchableTaxon {
  fullName: string;
  commonNames?: readonly string[];
  /** Raiz → ele mesmo */
  lineage: readonly { fullName: string }[];
}

/** Um lado da cruza: táxon do catálogo, nome livre ou desconhecido. */
export type SearchableCrossSide = { taxon: SearchableTaxon } | { text: string } | null;

export interface SearchablePlant {
  nickname: string;
  accessionNumber: number | null;
  receivedName: string | null;
  taxon: SearchableTaxon | null;
  cross: { seed: SearchableCrossSide; pollen: SearchableCrossSide } | null;
  currentLocation: { placeName: string | null } | null;
}

const taxonTexts = (t: SearchableTaxon) => [t.fullName, ...(t.commonNames ?? []), ...t.lineage.map((l) => l.fullName)];
const sideTexts = (s: SearchableCrossSide) => (!s ? [] : "taxon" in s ? taxonTexts(s.taxon) : [s.text]);

/**
 * Texto indexado de uma planta da Coleção, já normalizado: apelido, nº de tombo
 * ("0007" e "7"), nome da etiqueta, táxon com todos os níveis acima, os dois
 * parentais da cruza (da planta ou do grex) e o lugar onde ela está agora.
 */
export function plantSearchText(p: SearchablePlant): string {
  const parts = [
    p.nickname,
    p.receivedName ?? "",
    p.accessionNumber == null ? "" : `${formatAccession(p.accessionNumber)} ${p.accessionNumber}`,
    ...(p.taxon ? taxonTexts(p.taxon) : []),
    ...(p.cross ? [...sideTexts(p.cross.seed), ...sideTexts(p.cross.pollen)] : []),
    p.currentLocation?.placeName ?? "",
  ];
  return normalizeSearch(parts.join(" "));
}

/**
 * Cada palavra da busca precisa ser o começo de alguma palavra do texto:
 * "van falc" acha "Vanda falcata"; "7" acha o tombo 0007 mas não o 0017.
 * Busca vazia casa com tudo.
 */
export function matchesSearch(indexed: string, query: string): boolean {
  const needles = normalizeSearch(query).split(" ").filter(Boolean);
  if (!needles.length) return true;
  const words = indexed.split(" ");
  return needles.every((n) => words.some((w) => w.startsWith(n)));
}
