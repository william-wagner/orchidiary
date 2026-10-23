import type {
  Care,
  CareField,
  ComfortAttention,
  ComfortDay,
  ComfortDimension,
  ComfortFlag,
  ComfortRange,
  ChartWindow,
  CrossSide,
  EventType,
  TaxonOrigin,
  TaxonRank,
} from "@orchidiary/shared";

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

/** Localização do lugar; o histórico dele guarda uma linha por período. */
export interface PlaceLocation {
  id: string;
  placeId: string;
  lat: number;
  lng: number;
  city: string | null;
  state: string | null;
  stateCode: string | null;
  country: string | null;
  countryCode: string | null;
  validFrom: string;
  validTo: string | null;
}

/**
 * Lugar do usuário ("Orquidário quarto"). O lugar é dono da localização e do ambiente:
 * as plantas registradas nele usam os dois, e o clima é coletado por lugar.
 */
export interface Place {
  id: string;
  name: string;
  environment: "indoor" | "outdoor";
  /** Localização atual; null em lugar antigo que ainda não teve uma definida */
  location: PlaceLocation | null;
  /** Plantas que estão lá agora */
  plantCount: number;
  /** Períodos de permanência que o usam, contando o histórico; só some se for 0 */
  usedCount: number;
  /** Clima dos últimos 30 dias (lista) */
  weather?: PlaceWeatherDay[];
}

export interface PlaceWeatherDay {
  date: string;
  tempMin: number | null;
  tempMax: number | null;
  tempMean: number | null;
  humidityMean: number | null;
  humidityMin: number | null;
  humidityMax: number | null;
  precipitation: number | null;
}

/** Ficha do lugar: localização, histórico, clima e quem está lá. */
export interface PlaceDetail extends Omit<Place, "weather" | "usedCount"> {
  history: PlaceLocation[];
  weather: { from: string; to: string; days: PlaceWeatherDay[] };
  plants: Array<{
    id: string;
    nickname: string;
    taxonId: string | null;
    status: string;
    coverPhotoId: string | null;
    since: string;
  }>;
}

/**
 * Período de permanência da planta, com localização e ambiente JÁ RESOLVIDOS:
 * num lugar, são os dele; sem lugar, os dela.
 */
export interface PlantLocation {
  id: string;
  lat: number;
  lng: number;
  /** Cidade/estado/país das coordenadas; null enquanto não foi possível descobrir */
  city: string | null;
  state: string | null;
  stateCode: string | null;
  country: string | null;
  countryCode: string | null;
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
  /** Determinação por táxon do catálogo; nunca junto com `crossId` */
  taxonId: string | null;
  taxon: TaxonSummary | null;
  /** Determinação por cruza sem nome registrado; nunca junto com `taxonId` */
  crossId: string | null;
  /** Parentais: os da planta ou, num grex com parentais no catálogo, os do grex (`source: "taxon"`) */
  cross: PlantCross | null;
  /** De onde vem a ficha de cultivo (já resolvido pela API); null quando não há ficha */
  care: PlantCare | null;
  /** O nome como veio na etiqueta ou do vendedor */
  receivedName: string | null;
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
  /** Selos do índice de conforto (últimos 7 dias, a pior primeiro); null quando a planta não tem índice */
  comfort: ComfortFlag[] | null;
}

/** Um lado da cruza: o táxon do catálogo, o nome livre ou null (desconhecido). */
export type CrossSideView = { taxon: TaxonSummary } | { text: string } | null;

export interface PlantCross {
  id: string;
  source: "plant" | "taxon";
  seed: CrossSideView;
  pollen: CrossSideView;
  careFrom: CrossSide | null;
}

export interface PlantCare {
  taxonId: string;
  fullName: string;
  /** Quando a ficha vem de um parental: qual lado */
  side: CrossSide | null;
  /** Quando vem de um parental do grex: o grex */
  grexId: string | null;
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
  /** País, cruzamento ou desconhecida (já considera os ancestrais) */
  origin: TaxonOrigin;
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
  origin: TaxonOrigin;
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
  /** Registro em lote por local: id do lote e quantas plantas ele teve */
  batchId: string | null;
  batchSize: number | null;
}

export interface Reading {
  id: string;
  measuredAt: string;
  temperature: number | null;
  humidity: number | null;
  notes: string | null;
  /** Medição do lugar (em lote), que vale para quem estava lá; null quando é da própria planta */
  placeId: string | null;
  placeName: string | null;
}

/** O que a folha de lote precisa para a seleção inicial */
export interface BatchContext {
  recent: Array<{ plantId: string; occurredAt: string }>;
  remembered: string[];
}

export interface BatchCreated {
  batchId: string;
  count: number;
  /** Exclusões lembradas antes deste lote, para o "Desfazer" */
  previousExcluded: string[];
}

export interface WeatherDay {
  /** Período de localização do lugar ou da planta de onde veio o dia */
  sourceId: string;
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

export interface ComfortDimensionReport {
  dimension: ComfortDimension;
  range: ComfortRange;
  /** Táxon de onde a faixa foi herdada; null quando é do próprio táxon da planta */
  inheritedFrom: { rank: TaxonRank; rankLabel: string; fullName: string } | null;
  days: ComfortDay[];
  counts: { inside: number; near: number; outside: number };
  worst: ComfortDay | null;
  /** Últimos 7 dias (o que o selo do card mostra) */
  attention: ComfortAttention;
  silenced: boolean;
}

/** Seção Conforto da ficha */
export type PlantComfort =
  | { status: "no_location" }
  | { status: "no_ranges"; placeName: string | null }
  | {
      status: "ok";
      placeName: string | null;
      /** Dentro de casa, o clima de fora é só referência */
      environment: "indoor" | "outdoor";
      /** Desde quando a planta está no local atual */
      since: string;
      window: ChartWindow;
      /** Primeiro dia da planta no diário (limite da janela "tudo") */
      historyFrom: string | null;
      from: string;
      to: string;
      /** Numa cruza, de qual parental veio a ficha */
      crossCare: { side: CrossSide; fullName: string; fromGrex: boolean } | null;
      dimensions: ComfortDimensionReport[];
      /** Chuva do dia (mm), só dos dias com clima */
      precipitation: Array<{ date: string; mm: number | null }>;
      /** Medições manuais do período; `panel` é o painel de temperatura em que entram */
      readings: Array<{ id: string; measuredAt: string; temperature: number | null; humidity: number | null; panel: "night" | "day" }>;
    };

/** Item da fita de ocorrências e do feed da folha expandida (GET /plants/:id/occurrences) */
export type Occurrence =
  | { kind: "photo"; id: string; at: string; caption: string | null; width: number | null; height: number | null; placeName: string | null }
  | { kind: "event"; id: string; at: string; type: EventType; notes: string | null; data: Record<string, unknown>; placeName: string | null }
  | { kind: "reading"; id: string; at: string; temperature: number | null; humidity: number | null; notes: string | null; placeName: string | null };

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
