import type { Locality } from "@orchidiary/shared";

/** Resposta do Nominatim (`/reverse`, `addressdetails=1`) e sua tradução para `Locality`. Sem I/O, para testar. */
export interface NominatimResponse {
  address?: Record<string, string | undefined>;
}

/** Extrai a localidade da resposta do Nominatim. Cidade: do mais ao menos urbano. */
export function parseNominatim(body: NominatimResponse | null | undefined): Locality | null {
  const a = body?.address;
  if (!a) return null;
  const iso = a["ISO3166-2-lvl4"] ?? a["ISO3166-2-lvl3"];
  const locality: Locality = {
    city: a.city ?? a.town ?? a.village ?? a.municipality ?? a.county ?? null,
    state: a.state ?? a.region ?? null,
    // "BR-MG" → "MG"; só vale para siglas curtas (em alguns países o código é numérico/longo)
    stateCode: iso && /^[A-Z]{2}-[A-Z0-9]{1,3}$/.test(iso) ? iso.split("-")[1]! : null,
    country: a.country ?? null,
    countryCode: a.country_code ? a.country_code.toUpperCase() : null,
  };
  return locality.city || locality.state || locality.country ? locality : null;
}
