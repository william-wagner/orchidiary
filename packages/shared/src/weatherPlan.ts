import { addDays, toContiguousRanges, type IsoDate } from "./dates.ts";
import type { LatLng } from "./geo.ts";

/** Casas decimais usadas na consulta de clima (≈ 11 m) — a mesma precisão enviada à Open-Meteo. */
export const WEATHER_COORD_DECIMALS = 4;

/** Chave de coordenada: dois pontos com a mesma chave recebem exatamente a mesma resposta da API. */
export const coordKey = (p: LatLng) => `${p.lat.toFixed(WEATHER_COORD_DECIMALS)},${p.lng.toFixed(WEATHER_COORD_DECIMALS)}`;

/** Dias de clima que faltam para um período de local (de qualquer usuário). */
export interface WeatherNeed extends LatLng {
  locationId: string;
  missing: IsoDate[];
}

/** Uma requisição à API e para quais períodos de local cada dia dela deve ser gravado. */
export interface WeatherFetch extends LatLng {
  key: string;
  from: IsoDate;
  to: IsoDate;
  /** locationId → dias deste intervalo que faltam para ele */
  targets: Map<string, Set<IsoDate>>;
}

/**
 * Agrupa as lacunas por coordenada e monta as requisições: uma por faixa contínua
 * de dias (no máximo `maxDays`) por coordenada, não importa quantas plantas ou
 * usuários estejam ali. Cada dia retornado só vai para quem precisa dele.
 */
export function planWeatherFetches(needs: WeatherNeed[], maxDays: number): WeatherFetch[] {
  const groups = new Map<string, { lat: number; lng: number; needs: WeatherNeed[] }>();
  for (const n of needs) {
    if (!n.missing.length) continue;
    const key = coordKey(n);
    const g = groups.get(key) ?? { lat: n.lat, lng: n.lng, needs: [] };
    g.needs.push(n);
    groups.set(key, g);
  }

  const out: WeatherFetch[] = [];
  for (const [key, g] of groups) {
    const all = g.needs.flatMap((n) => n.missing);
    for (const range of toContiguousRanges(all)) {
      for (let from = range.from; from <= range.to; from = addDays(from, maxDays)) {
        const chunkTo = addDays(from, maxDays - 1);
        const to = chunkTo < range.to ? chunkTo : range.to;
        const targets = new Map<string, Set<IsoDate>>();
        for (const n of g.needs) {
          const days = n.missing.filter((d) => d >= from && d <= to);
          if (days.length) targets.set(n.locationId, new Set(days));
        }
        out.push({ key, lat: g.lat, lng: g.lng, from, to, targets });
      }
    }
  }
  return out;
}
