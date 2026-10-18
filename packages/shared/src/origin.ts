import type { TaxonOriginKind, TaxonRank } from "./enums.ts";

/**
 * Países de origem que o catálogo sabe nomear (ISO 3166-1 alfa-2). A lista é curta de
 * propósito: cada um tem uma bandeira embutida no app (ver `OriginFlag` no web).
 */
export const ORIGIN_COUNTRIES = {
  // Américas
  AR: "Argentina", BO: "Bolívia", BR: "Brasil", CL: "Chile", CO: "Colômbia", EC: "Equador", GY: "Guiana",
  PE: "Peru", PY: "Paraguai", SR: "Suriname", UY: "Uruguai", VE: "Venezuela",
  BS: "Bahamas", BZ: "Belize", CR: "Costa Rica", CU: "Cuba", DO: "República Dominicana", GT: "Guatemala",
  HN: "Honduras", HT: "Haiti", JM: "Jamaica", MX: "México", NI: "Nicarágua", PA: "Panamá", PR: "Porto Rico",
  SV: "El Salvador", TT: "Trinidad e Tobago", CA: "Canadá", US: "Estados Unidos",
  // Ásia
  BD: "Bangladesh", BN: "Brunei", BT: "Butão", CN: "China", ID: "Indonésia", IN: "Índia", JP: "Japão",
  KH: "Camboja", KR: "Coreia do Sul", LA: "Laos", LK: "Sri Lanka", MM: "Mianmar", MY: "Malásia", NP: "Nepal",
  PH: "Filipinas", SG: "Singapura", TH: "Tailândia", TW: "Taiwan", VN: "Vietnã",
  // Oceania
  AU: "Austrália", FJ: "Fiji", NZ: "Nova Zelândia", PG: "Papua-Nova Guiné", SB: "Ilhas Salomão", VU: "Vanuatu",
  // África
  CD: "República Democrática do Congo", CM: "Camarões", ET: "Etiópia", GA: "Gabão", KE: "Quênia", KM: "Comores", MG: "Madagascar",
  MU: "Maurício", MZ: "Moçambique", TZ: "Tanzânia", UG: "Uganda", ZA: "África do Sul", ZW: "Zimbábue",
  // Europa
  DE: "Alemanha", ES: "Espanha", FR: "França", GB: "Reino Unido", GR: "Grécia", IT: "Itália", PT: "Portugal",
} as const;
export type OriginCountryCode = keyof typeof ORIGIN_COUNTRIES;

export const isOriginCountry = (code: string | null | undefined): code is OriginCountryCode =>
  !!code && Object.hasOwn(ORIGIN_COUNTRIES, code);

export interface OriginCountry {
  code: OriginCountryCode;
  name: string;
}

/** Origem já resolvida, pronta para mostrar. Em `country`, o primeiro país é o principal. */
export type TaxonOrigin = { kind: "country"; countries: OriginCountry[] } | { kind: "cross" } | { kind: "unknown" };

export const UNKNOWN_ORIGIN: TaxonOrigin = { kind: "unknown" };

/** O que cada linha da tabela `taxa` guarda sobre a origem. */
export interface OriginFields {
  originKind: TaxonOriginKind | null;
  /** Países de ocorrência, o principal primeiro; só com `country` */
  originCountryCodes: string[];
}

/** Híbridos registrados e gêneros híbridos são cruzamentos feitos por gente: não têm lugar de origem. */
const CROSS_RANKS = new Set<TaxonRank>(["hybrid", "nothogenus"]);

/** Códigos da lista, sem repetir, na ordem em que vieram. */
const validCodes = (codes: readonly string[] | null | undefined) => [...new Set((codes ?? []).filter(isOriginCountry))];

/**
 * O que gravar em `taxa` para a origem informada: os países só valem com `country` e
 * precisam estar na lista; híbrido e gênero híbrido sem origem informada são `cross`.
 */
export function normalizeOrigin(rank: TaxonRank, input: Partial<OriginFields>): OriginFields {
  const codes = validCodes(input.originCountryCodes);
  if (input.originKind === "country" && codes.length) return { originKind: "country", originCountryCodes: codes };
  if (input.originKind === "cross" || CROSS_RANKS.has(rank)) return { originKind: "cross", originCountryCodes: [] };
  return { originKind: null, originCountryCodes: [] };
}

/** Explica por que a origem informada não serve, ou null se estiver certa. */
export function originError(input: Partial<OriginFields>): string | null {
  const codes = input.originCountryCodes ?? [];
  if (input.originKind === "country") {
    if (!codes.length) return "Informe pelo menos um país.";
    return codes.every(isOriginCountry) ? null : "Escolha países da lista.";
  }
  if (codes.length) return "Os países só valem quando a origem é um país.";
  return null;
}

/**
 * Origem efetiva: a do táxon mais específico da linhagem (raiz → táxon) que a preencheu,
 * como na ficha de cultivo. Ninguém preencheu: desconhecida.
 */
export function resolveOrigin(lineage: readonly Partial<OriginFields>[]): TaxonOrigin {
  for (let i = lineage.length - 1; i >= 0; i--) {
    const t = lineage[i]!;
    const codes = validCodes(t.originCountryCodes);
    if (t.originKind === "country" && codes.length) {
      return { kind: "country", countries: codes.map((code) => ({ code, name: ORIGIN_COUNTRIES[code] })) };
    }
    if (t.originKind === "cross") return { kind: "cross" };
  }
  return UNKNOWN_ORIGIN;
}

/** "China, Mianmar e Tailândia" */
export const countryList = (countries: readonly OriginCountry[]) => {
  const names = countries.map((c) => c.name);
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} e ${names.at(-1)}` : (names[0] ?? "");
};

export function originLabel(origin: TaxonOrigin): string {
  switch (origin.kind) {
    case "country":
      return `Origem: ${countryList(origin.countries)}`;
    case "cross":
      return "Cruzamento, sem origem definida";
    case "unknown":
      return "Origem desconhecida";
  }
}
