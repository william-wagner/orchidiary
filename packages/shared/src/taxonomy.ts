import type { TaxonRank } from "./enums.ts";

/** Um nó da árvore, do jeito mínimo que as regras precisam. */
export interface TaxonNode {
  rank: TaxonRank;
  /** Só a parte própria do nome: "Vanda", "coerulea", "alba", "Sansai Blue" */
  name: string;
}

export const RANK_LABEL: Record<TaxonRank, string> = {
  family: "família",
  subfamily: "subfamília",
  tribe: "tribo",
  subtribe: "subtribo",
  genus: "gênero",
  nothogenus: "gênero híbrido",
  species: "espécie",
  subspecies: "subespécie",
  variety: "variedade",
  form: "forma",
  hybrid: "híbrido",
  cultivar: "cultivar",
};

/** Níveis que podem ficar acima de cada um. Pular níveis é permitido (ninguém precisa cadastrar a subtribo). */
const ALLOWED_PARENTS: Record<TaxonRank, readonly TaxonRank[]> = {
  family: [],
  subfamily: ["family"],
  tribe: ["family", "subfamily"],
  subtribe: ["family", "subfamily", "tribe"],
  genus: ["family", "subfamily", "tribe", "subtribe"],
  nothogenus: ["family", "subfamily", "tribe", "subtribe"],
  species: ["genus"],
  subspecies: ["species"],
  variety: ["species", "subspecies"],
  form: ["species", "subspecies", "variety"],
  hybrid: ["genus", "nothogenus"],
  cultivar: ["species", "subspecies", "variety", "form", "hybrid"],
};

/** Gênero e acima podem ficar soltos (sem pai); o resto sempre pertence a alguém. */
const ROOTABLE = new Set<TaxonRank>(["family", "subfamily", "tribe", "subtribe", "genus", "nothogenus"]);

export const isSupraspecific = (rank: TaxonRank) => ROOTABLE.has(rank);

export function canBeChildOf(child: TaxonRank, parent: TaxonRank | null): boolean {
  return parent === null ? ROOTABLE.has(child) : ALLOWED_PARENTS[child].includes(parent);
}

/** Explica por que o nome não serve para o nível, ou null se estiver certo. */
export function taxonNameError(rank: TaxonRank, name: string): string | null {
  if (!name.trim()) return "Informe o nome.";
  if (rank === "cultivar") return /['"]/.test(name) ? "Escreva o cultivar sem aspas." : null;
  if (rank === "hybrid") return /^\p{Lu}/u.test(name) ? null : "O nome do híbrido começa com maiúscula (ex.: Sansai Blue).";
  if (ROOTABLE.has(rank)) {
    return /^\p{Lu}\p{Ll}+$/u.test(name) ? null : "Uma palavra só, com inicial maiúscula (ex.: Vanda).";
  }
  return /^[a-z][a-z-]*$/.test(name) ? null : "Epíteto em minúsculas, sem espaços (ex.: coerulea).";
}

export interface NamePart {
  text: string;
  italic: boolean;
}

const CONNECTOR: Partial<Record<TaxonRank, string>> = { subspecies: "subsp.", variety: "var.", form: "f." };

/**
 * Partes do nome com o estilo de cada uma, a partir da linhagem (raiz → táxon).
 * Gênero e abaixo vão em itálico; acima do gênero, híbrido (grex) e cultivar
 * ficam em redondo: "Vanda coerulea var. alba", "Vanda Sansai Blue 'Azul Real'".
 */
export function taxonNameParts(lineage: readonly TaxonNode[]): NamePart[] {
  const self = lineage.at(-1);
  if (!self) return [];
  const parent = () => taxonNameParts(lineage.slice(0, -1));
  let parts: NamePart[];
  switch (self.rank) {
    case "family":
    case "subfamily":
    case "tribe":
    case "subtribe":
      parts = [{ text: self.name, italic: false }];
      break;
    case "genus":
    case "nothogenus":
      parts = [{ text: self.name, italic: true }];
      break;
    case "species":
      parts = [...parent(), { text: " ", italic: true }, { text: self.name, italic: true }];
      break;
    case "subspecies":
    case "variety":
    case "form":
      parts = [...parent(), { text: ` ${CONNECTOR[self.rank]} `, italic: false }, { text: self.name, italic: true }];
      break;
    case "hybrid":
      parts = [...parent(), { text: ` ${self.name}`, italic: false }];
      break;
    case "cultivar":
      parts = [...parent(), { text: ` '${self.name}'`, italic: false }];
      break;
  }
  // junta pedaços vizinhos de mesmo estilo
  return parts.reduce<NamePart[]>((out, p) => {
    const last = out.at(-1);
    if (last && last.italic === p.italic) last.text += p.text;
    else out.push({ ...p });
    return out;
  }, []);
}

export const taxonFullName = (lineage: readonly TaxonNode[]) =>
  taxonNameParts(lineage)
    .map((p) => p.text)
    .join("");

/** Minúsculas, sem acento e sem pontuação: "V. Cœrúlea" → "v coerulea". Mesma regra no banco e na busca. */
export function normalizeSearch(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/æ/g, "ae")
    .replace(/œ/g, "oe")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Texto indexado para a busca: nome completo e nomes populares. */
export const taxonSearchText = (fullName: string, commonNames: readonly string[]) =>
  normalizeSearch([fullName, ...commonNames].join(" "));

/** Campos da ficha de cultivo. Quando o táxon não tem um deles, vale o do ancestral mais próximo. */
export const CARE_FIELDS = [
  "tempDayMin",
  "tempDayMax",
  "tempNightMin",
  "tempNightMax",
  "humidityMin",
  "humidityMax",
  "light",
  "watering",
  "fertilizing",
  "substrate",
  "bloomMonths",
  "restPeriod",
] as const;
export type CareField = (typeof CARE_FIELDS)[number];

export interface Care {
  tempDayMin: number | null;
  tempDayMax: number | null;
  tempNightMin: number | null;
  tempNightMax: number | null;
  humidityMin: number | null;
  humidityMax: number | null;
  light: string | null;
  watering: string | null;
  fertilizing: string | null;
  substrate: string | null;
  bloomMonths: number[];
  restPeriod: string | null;
}

const isEmpty = (v: unknown) => v == null || v === "" || (Array.isArray(v) && v.length === 0);

/** Um táxon tem ficha própria se preencheu pelo menos um campo de cultivo. */
export const hasOwnCare = (t: Partial<Care>) => CARE_FIELDS.some((f) => !isEmpty(t[f]));

/**
 * Ficha efetiva: cada campo vem do táxon mais específico da linhagem (raiz → táxon)
 * que o preencheu. `sources` diz de qual táxon veio cada campo.
 */
export function inheritCare<T extends Partial<Care> & { id: string }>(lineage: readonly T[]) {
  const care: Care = {
    tempDayMin: null,
    tempDayMax: null,
    tempNightMin: null,
    tempNightMax: null,
    humidityMin: null,
    humidityMax: null,
    light: null,
    watering: null,
    fertilizing: null,
    substrate: null,
    bloomMonths: [],
    restPeriod: null,
  };
  const sources: Partial<Record<CareField, string>> = {};
  for (const field of CARE_FIELDS) {
    for (let i = lineage.length - 1; i >= 0; i--) {
      const value = lineage[i]![field];
      if (!isEmpty(value)) {
        (care as unknown as Record<CareField, unknown>)[field] = value;
        sources[field] = lineage[i]!.id;
        break;
      }
    }
  }
  return { care, sources };
}
