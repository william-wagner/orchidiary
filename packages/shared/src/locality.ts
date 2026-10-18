/**
 * Localidade (cidade/estado/país) de um ponto. É um complemento legível das coordenadas,
 * que continuam sendo a fonte da verdade do período de local.
 */
export interface Locality {
  city: string | null;
  /** Nome por extenso ("Minas Gerais") */
  state: string | null;
  /** Sigla quando existe ("MG") */
  stateCode: string | null;
  country: string | null;
  /** ISO 3166-1 alfa-2, em maiúsculas ("BR") */
  countryCode: string | null;
}

export const EMPTY_LOCALITY: Locality = { city: null, state: null, stateCode: null, country: null, countryCode: null };

/** "Belo Horizonte, MG, Brasil". Partes que faltam são omitidas; sem nada, devolve null. */
export function formatLocality(l: Partial<Locality> | null | undefined): string | null {
  if (!l) return null;
  const parts = [l.city, l.stateCode || l.state, l.country].filter((p): p is string => !!p?.trim());
  return parts.length ? parts.join(", ") : null;
}
