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
};

// ─── Tipos de resposta (espelham as tabelas da API) ──────────────────────────

export interface User {
  id: string;
  email: string;
  name: string;
  role: "master" | "user";
}

export interface PlantLocation {
  id: string;
  lat: number;
  lng: number;
  label: string | null;
  environment: "indoor" | "outdoor";
  validFrom: string;
  validTo: string | null;
}

export interface Plant {
  id: string;
  nickname: string;
  accessionNumber: number | null;
  speciesId: string | null;
  taxonText: string | null;
  status: string;
  acquiredAt: string | null;
  notes: string | null;
  coverPhotoId: string | null;
  currentLocation: PlantLocation | null;
}

/** Item da coleção: inclui a foto mais recente e se a planta está em flor. */
export interface CollectionPlant extends Plant {
  lastPhotoId: string | null;
  inBloom: boolean;
}

export interface Species {
  id: string;
  genus: string;
  epithet: string | null;
  displayName: string;
  commonNames: string[];
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
  notes: string | null;
}

export interface Photo {
  id: string;
  takenAt: string;
  source: "camera" | "upload";
  caption: string | null;
  locationId: string | null;
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
  plantLocation: { id: string; lat: number; lng: number; label: string | null; environment: "indoor" | "outdoor" };
  canMoveFromPhoto: boolean;
}

export const photoUrl = (id: string, size: "thumb" | "full" = "full") =>
  `/api/photos/${id}/file${size === "thumb" ? "?size=thumb" : ""}`;
