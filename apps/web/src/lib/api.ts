import type { Care, CareField, TaxonRank } from "@orchidiary/shared";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const isForm = init.body instanceof FormData;
  const res = await fetch(`/api${path}`, {
    credentials: "include",
    ...init,
    headers: isForm ? init.headers : { "content-type": "application/json", ...init.headers },
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (body as { error?: string }).error ?? `Erro ${res.status}`, body);
  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: "POST", body: data instanceof FormData ? data : JSON.stringify(data ?? {}) }),
  put: <T>(path: string, data: unknown) => request<T>(path, { method: "PUT", body: JSON.stringify(data) }),
  patch: <T>(path: string, data: unknown) => request<T>(path, { method: "PATCH", body: JSON.stringify(data) }),
  delete: <T = void>(path: string) => request<T>(path, { method: "DELETE" }),
};

// ─── Tipos de resposta (espelham as tabelas da API) ──────────────────────────

export interface User {
  id: string;
  email: string;
  name: string;
  role: "master" | "user";
}

/** Lugar nomeado do usuário ("Orquidário quarto"). */
export interface Place {
  id: string;
  name: string;
  /** Plantas que estão lá agora */
  plantCount: number;
  /** Períodos de local que o usam, contando o histórico; só some se for 0 */
  usedCount: number;
}

export interface PlantLocation {
  id: string;
  lat: number;
  lng: number;
  placeId: string | null;
  placeName: string | null;
  environment: "indoor" | "outdoor";
  validFrom: string;
  validTo: string | null;
}

export interface Plant {
  id: string;
  nickname: string;
  accessionNumber: number | null;
  taxonId: string | null;
  /** Nome livre, quando o táxon não está no catálogo */
  taxonText: string | null;
  taxon: TaxonSummary | null;
  status: string;
  origin: string | null;
  acquiredAt: string | null;
  potNotes: string | null;
  substrate: string | null;
  notes: string | null;
  coverPhotoId: string | null;
  currentLocation: PlantLocation | null;
}

/** Item da coleção: inclui a foto mais recente e se a planta está em flor. */
export interface CollectionPlant extends Plant {
  lastPhotoId: string | null;
  /** Quando a prancha botânica da capa ficou pronta; null enquanto não existe */
  coverIllustratedAt: string | null;
  inBloom: boolean;
}

export interface TaxonRef {
  id: string;
  rank: TaxonRank;
  name: string;
  fullName: string;
}

/** Táxon com o caminho na árvore (raiz → ele mesmo). */
export interface TaxonSummary extends TaxonRef {
  commonNames: string[];
  lineage: TaxonRef[];
}

/** Item da busca e da lista do Guia */
export interface TaxonHit extends TaxonSummary {
  /** Tem ficha de cultivo própria (não só herdada) */
  hasCare: boolean;
}

/** Ficha completa: campos próprios, linhagem, táxons logo abaixo e a ficha efetiva (com herança). */
export interface TaxonSheet extends TaxonRef, Care {
  parentId: string | null;
  commonNames: string[];
  notes: string | null;
  hasCare: boolean;
  lineage: TaxonRef[];
  children: (TaxonRef & { hasCare: boolean })[];
  care: Care;
  /** De qual táxon da linhagem veio cada campo da ficha efetiva */
  careSources: Partial<Record<CareField, string>>;
}

export interface Photo {
  id: string;
  takenAt: string;
  source: "camera" | "upload";
  caption: string | null;
  locationId: string | null;
  illustrationStatus: "pending" | "ready" | "error" | null;
  illustrationUpdatedAt: string | null;
}

export interface DiaryEvent {
  id: string;
  type: string;
  occurredAt: string;
  notes: string | null;
  data: Record<string, unknown>;
}

export interface Reading {
  id: string;
  measuredAt: string;
  temperature: number | null;
  humidity: number | null;
  notes: string | null;
}

export interface WeatherDay {
  locationId: string;
  date: string;
  tempMin: number | null;
  tempMax: number | null;
  tempMean: number | null;
  humidityMean: number | null;
  precipitation: number | null;
  vpdMean: number | null;
}

export interface Timeline {
  plant: Plant;
  locations: PlantLocation[];
  photos: Photo[];
  events: DiaryEvent[];
  readings: Reading[];
  weather: WeatherDay[];
}

export interface LocationCheck {
  mismatch: boolean;
  distanceMeters: number;
  photoLocation: { lat: number; lng: number };
  plantLocation: { id: string; lat: number; lng: number; placeName: string | null; environment: "indoor" | "outdoor" };
  canMoveFromPhoto: boolean;
}

export const photoUrl = (id: string, size: "thumb" | "full" = "full") =>
  `/api/photos/${id}/file${size === "thumb" ? "?size=thumb" : ""}`;

/** Prancha botânica da capa; a data versiona a URL (o arquivo é servido como imutável). */
export const illustrationUrl = (id: string, illustratedAt: string, size: "thumb" | "full" = "full") =>
  `/api/photos/${id}/file?variant=illustration${size === "thumb" ? "&size=thumb" : ""}&v=${new Date(illustratedAt).getTime()}`;
