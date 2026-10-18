import type { Locality } from "@orchidiary/shared";
import { sourceLogger } from "../logger.ts";
import { type NominatimResponse, parseNominatim } from "./nominatim.ts";

/**
 * Geocodificação reversa (coordenadas → cidade/estado/país) pelo Nominatim do OpenStreetMap.
 * Política de uso deles: User-Agent identificável, no máximo 1 requisição por segundo e cache.
 * Qualquer falha devolve null: a localidade é um complemento, nunca impede salvar o local.
 */
const log = sourceLogger("geocode");
const URL_BASE = "https://nominatim.openstreetmap.org/reverse";
const USER_AGENT = "Orchidiary/1.0 (diario pessoal de orquideas)";
const MIN_INTERVAL_MS = 1100;
const TIMEOUT_MS = 5000;

// Cache por célula de ~110 m: plantas no mesmo quintal compartilham a resposta.
const cache = new Map<string, Locality | null>();
const cacheKey = (lat: number, lng: number) => `${lat.toFixed(3)},${lng.toFixed(3)}`;

// Fila simples: serializa as chamadas respeitando o intervalo mínimo.
let queue: Promise<unknown> = Promise.resolve();
let lastCall = 0;
function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = lastCall + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCall = Date.now();
    return fn();
  });
  queue = run.catch(() => undefined);
  return run;
}

// Depois de uma falha (sem internet, serviço fora), não insiste por um tempo: as telas
// que pedem a localidade não devem ficar esperando o timeout a cada abertura.
const FAILURE_COOLDOWN_MS = 5 * 60_000;
let failedAt = 0;

export async function reverseGeocode(lat: number, lng: number): Promise<Locality | null> {
  const key = cacheKey(lat, lng);
  if (cache.has(key)) return cache.get(key)!;
  if (Date.now() - failedAt < FAILURE_COOLDOWN_MS) return null;
  try {
    const body = await throttled(async () => {
      const url = `${URL_BASE}?format=jsonv2&zoom=10&addressdetails=1&accept-language=pt-BR&lat=${lat}&lon=${lng}`;
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) throw new Error(`Nominatim respondeu ${res.status}`);
      return (await res.json()) as NominatimResponse;
    });
    const locality = parseNominatim(body);
    cache.set(key, locality); // só guarda respostas válidas, inclusive "sem endereço" (oceano)
    return locality;
  } catch (err) {
    failedAt = Date.now();
    log.warn({ err }, "Falha na geocodificação reversa");
    return null;
  }
}

