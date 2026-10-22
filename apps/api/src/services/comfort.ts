import { and, eq, gte, inArray, isNull, lte, notInArray, sql } from "drizzle-orm";
import {
  addDays,
  attentionOf,
  CHART_DEFAULT_WINDOW,
  type ChartWindow,
  chartRange,
  COMFORT_CARD_DAYS,
  COMFORT_DIMENSIONS,
  comfortChanges,
  comfortDays,
  comfortFlags,
  type ComfortDimension,
  type ComfortFlag,
  climateSegments,
  climateWindows,
  comfortRanges,
  type ComfortRanges,
  type ComfortWeatherDay,
  type CareField,
  daysBetween,
  digestBoundary,
  digestWindows,
  hasComfortRanges,
  RANK_LABEL,
  readingPanel,
  startOfLocalDay,
  toLocalDate,
} from "@orchidiary/shared";
import { db, schema } from "../db/client.ts";
import { env } from "../env.ts";
import { formatComfortDigest, type DigestPlant } from "./alertRules.ts";
import { sendAlert } from "./telegram.ts";
import { effectiveCareOf } from "./taxonomy.ts";
import { listLocations } from "./locations.ts";
import { readingsForPlant } from "./readings.ts";

const { weatherDaily, comfortSilences, plants, plantLocations, placeLocations, places, taxa } = schema;

type WeatherDay = ComfortWeatherDay & { precipitation: number | null };

/** Plantas que saíram da coleção não entram no índice */
const GONE = ["dead", "given_away"] as const;

/** Campos da ficha que formam a faixa de cada dimensão */
const RANGE_FIELDS: Record<ComfortDimension, [CareField, CareField]> = {
  night: ["tempNightMin", "tempNightMax"],
  day: ["tempDayMin", "tempDayMax"],
  humidity: ["humidityMin", "humidityMax"],
};

/** Último dia com clima coletado: ontem, no fuso do app (a coleta das 06:10 fecha o dia anterior). */
export const comfortEnd = (now = new Date()) => addDays(toLocalDate(now, env.APP_TIMEZONE), -1);

/**
 * Série de clima de cada planta no intervalo, já resolvida por fonte: enquanto a planta
 * esteve num lugar, os dias vêm da série do lugar; fora dele, da série dela mesma.
 * Uma janela que atravessa uma mudança junta as duas pontas, sem nada retroativo.
 */
async function weatherByPlant(plantIds: string[], from: string, to: string) {
  const out = new Map<string, WeatherDay[]>();
  const ids = [...new Set(plantIds)];
  if (!ids.length) return out;

  const periods = await db.select().from(plantLocations).where(inArray(plantLocations.plantId, ids));
  const placeIds = [...new Set(periods.map((p) => p.placeId).filter((id): id is string => !!id))];
  const placePeriods = placeIds.length
    ? await db.select().from(placeLocations).where(inArray(placeLocations.placeId, placeIds))
    : [];

  const windowsBy = new Map<string, ReturnType<typeof climateWindows>>();
  const placeSources = new Set<string>();
  const plantSources = new Set<string>();
  for (const plantId of ids) {
    const segments = climateSegments(
      periods.filter((p) => p.plantId === plantId),
      placePeriods as Array<(typeof placePeriods)[number] & { placeId: string }>,
    );
    const windows = climateWindows(segments, env.APP_TIMEZONE, from, to);
    if (!windows.length) continue;
    windowsBy.set(plantId, windows);
    for (const w of windows) (w.source.kind === "place" ? placeSources : plantSources).add(w.source.id);
  }
  if (!windowsBy.size) return out;

  const columns = {
    date: weatherDaily.date,
    tempMin: weatherDaily.tempMin,
    tempMax: weatherDaily.tempMax,
    humidityMean: weatherDaily.humidityMean,
    precipitation: weatherDaily.precipitation,
  };
  const [placeRows, plantRows] = await Promise.all([
    placeSources.size
      ? db
          .select({ ...columns, sourceId: weatherDaily.placeLocationId })
          .from(weatherDaily)
          .where(and(inArray(weatherDaily.placeLocationId, [...placeSources]), gte(weatherDaily.date, from), lte(weatherDaily.date, to)))
      : Promise.resolve([]),
    plantSources.size
      ? db
          .select({ ...columns, sourceId: weatherDaily.locationId })
          .from(weatherDaily)
          .where(and(inArray(weatherDaily.locationId, [...plantSources]), gte(weatherDaily.date, from), lte(weatherDaily.date, to)))
      : Promise.resolve([]),
  ]);
  const bySource = new Map<string, WeatherDay[]>();
  for (const { sourceId, ...day } of [...placeRows, ...plantRows]) {
    if (!sourceId) continue;
    const list = bySource.get(sourceId) ?? [];
    list.push(day);
    bySource.set(sourceId, list);
  }

  for (const [plantId, windows] of windowsBy) {
    const days = windows
      .flatMap((w) => (bySource.get(w.source.id) ?? []).filter((d) => d.date >= w.from && d.date <= w.to))
      .sort((a, b) => a.date.localeCompare(b.date));
    out.set(plantId, days);
  }
  return out;
}

/** Dimensões silenciadas que ainda valem: as registradas no período de local atual de cada planta. */
async function silencesOf(current: Array<{ plantId: string; locationId: string }>) {
  const out = new Map<string, Set<ComfortDimension>>();
  if (!current.length) return out;
  const rows = await db
    .select()
    .from(comfortSilences)
    .where(inArray(comfortSilences.plantId, current.map((c) => c.plantId)));
  const locationOf = new Map(current.map((c) => [c.plantId, c.locationId]));
  for (const r of rows) {
    if (locationOf.get(r.plantId) !== r.locationId) continue;
    const set = out.get(r.plantId) ?? new Set();
    set.add(r.dimension);
    out.set(r.plantId, set);
  }
  return out;
}

async function rangesOf(taxonIds: string[]) {
  const care = await effectiveCareOf(taxonIds);
  return new Map([...care].map(([id, c]) => [id, { ranges: comfortRanges(c.care), sources: c.sources }]));
}

/**
 * Selos da Coleção: para cada planta com faixa, o que saiu da faixa nos últimos 7 dias.
 * Plantas dentro de casa também entram, com o clima de fora como referência, até haver sensores.
 */
export async function collectionComfort(
  rows: Array<{ plantId: string; status: string; taxonId: string | null; location: { id: string } | null }>,
  now = new Date(),
): Promise<Map<string, ComfortFlag[]>> {
  const eligible = rows.filter(
    (r): r is typeof r & { taxonId: string; location: { id: string } } =>
      !!r.taxonId && !!r.location && !(GONE as readonly string[]).includes(r.status),
  );
  const out = new Map<string, ComfortFlag[]>();
  if (!eligible.length) return out;
  const end = comfortEnd(now);
  const [ranges, weather, silenced] = await Promise.all([
    rangesOf(eligible.map((r) => r.taxonId)),
    weatherByPlant(
      eligible.map((r) => r.plantId),
      addDays(end, -(COMFORT_CARD_DAYS - 1)),
      end,
    ),
    silencesOf(eligible.map((r) => ({ plantId: r.plantId, locationId: r.location.id }))),
  ]);
  for (const r of eligible) {
    const rr = ranges.get(r.taxonId)?.ranges;
    if (!rr || !hasComfortRanges(rr)) continue;
    out.set(r.plantId, comfortFlags(rr, weather.get(r.plantId) ?? [], end, silenced.get(r.plantId)));
  }
  return out;
}

/** Período atual da planta, com lugar, coordenadas e ambiente resolvidos. */
async function currentLocation(plantId: string) {
  const period = (await listLocations(plantId)).find((p) => p.validTo === null);
  return period ? { location: period, placeName: period.placeName } : null;
}

/**
 * Gráfico "Clima e ocorrências" da ficha: a janela pedida (padrão 90 dias), dimensão por
 * dimensão, mais a chuva do dia e as medições manuais. O clima de cada dia vem do local
 * onde a planta estava naquele dia: mudanças no meio da janela não recalculam nada.
 */
export async function plantComfort(plant: { id: string; taxonId: string | null }, window: ChartWindow = CHART_DEFAULT_WINDOW, now = new Date()) {
  const periods = await listLocations(plant.id);
  const current = periods.find((p) => p.validTo === null);
  if (!current) return { status: "no_location" as const };
  const placeName = current.placeName;
  if (!plant.taxonId) return { status: "no_ranges" as const, placeName };
  const care = (await rangesOf([plant.taxonId])).get(plant.taxonId);
  if (!care || !hasComfortRanges(care.ranges)) return { status: "no_ranges" as const, placeName };

  const tz = env.APP_TIMEZONE;
  const end = comfortEnd(now);
  const historyFrom = periods[0] ? toLocalDate(periods[0].validFrom, tz) : null;
  const { from } = chartRange(window, end, historyFrom);
  const [weather, silenced, readings] = await Promise.all([
    weatherByPlant([plant.id], from, end),
    silencesOf([{ plantId: plant.id, locationId: current.id }]),
    readingsForPlant(plant.id, periods, startOfLocalDay(from, tz), startOfLocalDay(addDays(end, 1), tz)),
  ]);
  const days = weather.get(plant.id) ?? [];
  const off = silenced.get(plant.id) ?? new Set<ComfortDimension>();

  // de qual táxon veio cada faixa, para dizer "faixa do gênero Vanda" quando é herdada
  const sourceIds = COMFORT_DIMENSIONS.map((d) => care.sources[RANGE_FIELDS[d][0]] ?? care.sources[RANGE_FIELDS[d][1]]).filter(
    (id): id is string => !!id && id !== plant.taxonId,
  );
  const sourceTaxa = sourceIds.length
    ? await db.select({ id: taxa.id, rank: taxa.rank, fullName: taxa.fullName }).from(taxa).where(inArray(taxa.id, sourceIds))
    : [];
  const sourceBy = new Map(sourceTaxa.map((t) => [t.id, { rank: t.rank, rankLabel: RANK_LABEL[t.rank], fullName: t.fullName }]));

  const cardFrom = addDays(end, -(COMFORT_CARD_DAYS - 1));
  const dimensions = COMFORT_DIMENSIONS.flatMap((dimension) => {
    const range = care.ranges[dimension];
    if (!range) return [];
    const list = comfortDays(dimension, range, days, from, end);
    const counts = { inside: 0, near: 0, outside: 0 };
    for (const d of list) if (d.state) counts[d.state]++;
    const worst = list.reduce<(typeof list)[number] | null>((w, d) => (d.diff > (w?.diff ?? 0) ? d : w), null);
    const sourceId = care.sources[RANGE_FIELDS[dimension][0]] ?? care.sources[RANGE_FIELDS[dimension][1]];
    return [
      {
        dimension,
        range,
        inheritedFrom: (sourceId && sourceBy.get(sourceId)) || null,
        days: list,
        counts,
        worst,
        /** O que o selo do card mostra (últimos 7 dias), mesmo silenciado */
        attention: attentionOf(list.filter((d) => d.date >= cardFrom)),
        silenced: off.has(dimension),
      },
    ];
  });
  return {
    status: "ok" as const,
    placeName,
    /** Dentro de casa, o clima de fora é só referência (o app avisa) */
    environment: current.environment,
    since: current.validFrom,
    window,
    /** Primeiro dia da planta no diário (limite da janela "tudo") */
    historyFrom,
    from,
    to: end,
    dimensions,
    /** Chuva do dia (mm), só dos dias com clima */
    precipitation: days.map((d) => ({ date: d.date, mm: d.precipitation })),
    /** Medições manuais; `panel` diz em qual painel de temperatura entram (a umidade vai sempre no de baixo) */
    readings: readings.map((r) => ({
      id: r.id,
      measuredAt: r.measuredAt,
      temperature: r.temperature,
      humidity: r.humidity,
      panel: readingPanel(r.measuredAt, tz),
    })),
  };
}

/** "Já sei, não avisar": vale até a planta mudar de local. */
export async function setComfortSilence(plantId: string, dimension: ComfortDimension, silenced: boolean) {
  if (!silenced) {
    await db.delete(comfortSilences).where(and(eq(comfortSilences.plantId, plantId), eq(comfortSilences.dimension, dimension)));
    return true;
  }
  const cur = await currentLocation(plantId);
  if (!cur) return false;
  await db
    .insert(comfortSilences)
    .values({ plantId, dimension, locationId: cur.location.id })
    .onConflictDoUpdate({ target: [comfortSilences.plantId, comfortSilences.dimension], set: { locationId: cur.location.id, createdAt: new Date() } });
  return true;
}

/** Quantos dias depois do fechamento da quinzena o resumo ainda sai (PC desligado no dia). */
const DIGEST_GRACE_DAYS = 2;

/**
 * Resumo quinzenal no Telegram: roda todo dia, mas só manda no fechamento da quinzena
 * (ou até 2 dias depois) e só se algo mudou. O dedupe por usuário e quinzena evita repetir.
 */
export async function runComfortDigest(now = new Date()) {
  const today = toLocalDate(now, env.APP_TIMEZONE);
  const boundary = digestBoundary(today);
  if (daysBetween(boundary, today) > DIGEST_GRACE_DAYS) return { due: false as const };
  const w = digestWindows(boundary);
  const rows = await db
    .select({
      plantId: plants.id,
      userId: plants.userId,
      nickname: plants.nickname,
      taxonId: plants.taxonId,
      locationId: plantLocations.id,
      // o ambiente é do lugar quando a planta está num; sem lugar, é dela
      environment: sql<"indoor" | "outdoor">`coalesce(${places.environment}, ${plantLocations.environment})`,
    })
    .from(plants)
    .innerJoin(plantLocations, and(eq(plantLocations.plantId, plants.id), isNull(plantLocations.validTo)))
    .leftJoin(places, eq(places.id, plantLocations.placeId))
    .where(notInArray(plants.status, [...GONE]));
  const withTaxon = rows.filter((r): r is typeof r & { taxonId: string } => !!r.taxonId);
  const [ranges, weather, silenced, names] = await Promise.all([
    rangesOf(withTaxon.map((r) => r.taxonId)),
    weatherByPlant(
      withTaxon.map((r) => r.plantId),
      w.previous.from,
      w.current.to,
    ),
    silencesOf(withTaxon.map((r) => ({ plantId: r.plantId, locationId: r.locationId }))),
    withTaxon.length
      ? db.select({ id: taxa.id, fullName: taxa.fullName }).from(taxa).where(inArray(taxa.id, [...new Set(withTaxon.map((r) => r.taxonId))]))
      : Promise.resolve([]),
  ]);
  const nameOf = new Map(names.map((t) => [t.id, t.fullName]));

  const byUser = new Map<string, { plants: DigestPlant[]; unchanged: number; silenced: number }>();
  for (const r of withTaxon) {
    const rr: ComfortRanges | undefined = ranges.get(r.taxonId)?.ranges;
    if (!rr || !hasComfortRanges(rr)) continue;
    const off = silenced.get(r.plantId) ?? new Set<ComfortDimension>();
    const days = weather.get(r.plantId) ?? [];
    const changes = comfortChanges(rr, days, boundary, off);
    const acc = byUser.get(r.userId) ?? { plants: [], unchanged: 0, silenced: 0 };
    // silenciados que ainda estão fora da faixa: só contados no rodapé
    for (const d of off) {
      const range = rr[d];
      if (range && attentionOf(comfortDays(d, range, days, w.current.from, w.current.to)).direction) acc.silenced++;
    }
    if (changes.length) acc.plants.push({ taxonName: nameOf.get(r.taxonId) ?? r.nickname, nickname: r.nickname, indoor: r.environment === "indoor", changes });
    else acc.unchanged++;
    byUser.set(r.userId, acc);
  }

  let sent = 0;
  for (const [userId, acc] of byUser) {
    const message = formatComfortDigest({
      from: w.current.from,
      to: w.current.to,
      ...acc,
      link: `${env.WEB_ORIGIN.replace(/\/$/, "")}/?conforto=fora`,
    });
    if (!message) continue;
    const r = await sendAlert({ userId, kind: "comfort_digest", message, dedupeKey: `comfort-digest:${userId}:${boundary}` });
    if (r === "sent") sent++;
  }
  return { due: true as const, boundary, plants: withTaxon.length, sent };
}
