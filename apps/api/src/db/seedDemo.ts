/**
 * Seed de desenvolvimento: a planta FAKE, uma Phalaenopsis com um ano de vida no diário
 * (fotos, eventos, medições, duas mudanças de lugar e clima real do Open-Meteo).
 * Idempotente: apaga a FAKE e os lugares dela e recria tudo; não toca em nenhuma outra planta.
 * As fotos vêm de `.local/seed-fotos-1-ano/fotos/` (fora do git). Ver docs/estudos/clima-e-ocorrencias.md.
 */
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import type { EventType } from "@orchidiary/shared";
import { env } from "../env.ts";
import { movePlant } from "../services/locations.ts";
import { savePhoto } from "../services/photos.ts";
import { createPlaceLocation } from "../services/places.ts";
import { collectWeather } from "../services/weather/collect.ts";
import { db, schema, sqlClient } from "./client.ts";

const { events, manualReadings, places, plantLocations, plants, taxa, users } = schema;

const NICKNAME = "FAKE";
const PORCH = "Varanda FAKE";
const INDOORS = "Sala FAKE";
/** Uma casa em São Paulo: a varanda e a sala dividem a coordenada (indoor usa o clima de fora como referência). */
const HOME = { lat: -23.5614, lng: -46.6559 };

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const photoDir = join(root, ".local/seed-fotos-1-ano/fotos");

/** Data e hora locais de São Paulo (sem horário de verão desde 2019). */
const at = (local: string) => new Date(`${local}${local.length === 10 ? "T12:00" : ""}:00-03:00`);
const DAY = 86_400_000;

// PRNG determinístico: o seed gera sempre a mesma história
const rng = ((seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296))(20251024);
const between = (min: number, max: number) => min + rng() * (max - min);
const round1 = (n: number) => Math.round(n * 10) / 10;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

// ─── Antes de tocar no banco: as fotos precisam estar todas lá ───────────────

interface ManifestItem {
  arquivo: string;
  data: string;
  nota: string;
}
const manifestPath = join(photoDir, "manifest.json");
if (!existsSync(manifestPath)) {
  fail(`Fotos do seed não encontradas em ${photoDir}. Gere com: node .local/seed-fotos-1-ano/gerar.mjs`);
}
const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as ManifestItem[];
const missing = manifest.filter((m) => !existsSync(join(photoDir, m.arquivo)));
if (missing.length) fail(`Faltam fotos do seed em ${photoDir}: ${missing.map((m) => m.arquivo).join(", ")}`);

const email = process.env.MASTER_EMAIL?.toLowerCase();
if (!email) fail("Defina MASTER_EMAIL no .env (a planta FAKE é do usuário master).");
const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
if (!user) fail(`Usuário ${email} não existe. Rode antes: pnpm db:seed`);

const [genus] = await db
  .select({ id: taxa.id })
  .from(taxa)
  .where(and(eq(taxa.rank, "genus"), eq(taxa.name, "Phalaenopsis")))
  .limit(1);
if (!genus) fail("Gênero Phalaenopsis não está no catálogo. Rode antes: pnpm db:seed");

// ─── Limpeza: a FAKE anterior e os lugares dela ──────────────────────────────

const oldPlants = await db
  .select({ id: plants.id })
  .from(plants)
  .where(and(eq(plants.userId, user.id), eq(plants.nickname, NICKNAME)));
const oldPlantIds = oldPlants.map((p) => p.id);
const oldPlaces = await db
  .select({ id: places.id, name: places.name })
  .from(places)
  .where(and(eq(places.userId, user.id), inArray(sql`lower(${places.name})`, [PORCH.toLowerCase(), INDOORS.toLowerCase()])));
const oldPlaceIds = oldPlaces.map((p) => p.id);

if (oldPlaceIds.length) {
  const others = await db
    .select({ id: plantLocations.plantId })
    .from(plantLocations)
    .where(
      and(
        inArray(plantLocations.placeId, oldPlaceIds),
        oldPlantIds.length ? notInArray(plantLocations.plantId, oldPlantIds) : undefined,
      ),
    )
    .limit(1);
  if (others.length) {
    fail(`Outra planta já passou por "${PORCH}" ou "${INDOORS}". Tire-a de lá (ou renomeie o lugar) antes de rodar o seed.`);
  }
}

await db.transaction(async (tx) => {
  if (oldPlaceIds.length) await tx.delete(manualReadings).where(inArray(manualReadings.placeId, oldPlaceIds));
  // fotos, eventos, períodos, medições e clima próprio caem em cascata
  if (oldPlantIds.length) await tx.delete(plants).where(inArray(plants.id, oldPlantIds));
  if (oldPlaceIds.length) await tx.delete(places).where(inArray(places.id, oldPlaceIds));
});
for (const id of oldPlantIds) await rm(resolve(env.STORAGE_DIR, id), { recursive: true, force: true });
if (oldPlantIds.length) console.log(`FAKE anterior apagada (${oldPlantIds.length}).`);

// ─── Lugares e planta ────────────────────────────────────────────────────────

const ARRIVAL = at("2025-10-24T15:30");
const TO_INDOORS = at("2026-06-05T19:00");
const BACK_OUTSIDE = at("2026-09-05T10:00");

const [porch] = await db.insert(places).values({ userId: user.id, name: PORCH, environment: "outdoor" }).returning();
const [indoors] = await db.insert(places).values({ userId: user.id, name: INDOORS, environment: "indoor" }).returning();
// o clima do lugar começa junto com a planta: um ano de série para cada um
await createPlaceLocation(porch!.id, { ...HOME, validFrom: ARRIVAL });
await createPlaceLocation(indoors!.id, { ...HOME, validFrom: ARRIVAL });

const plant = await db.transaction(async (tx) => {
  const [{ next } = { next: 1 }] = await tx
    .select({ next: sql<number>`coalesce(max(${plants.accessionNumber}), 0) + 1` })
    .from(plants)
    .where(eq(plants.userId, user.id));
  const [created] = await tx
    .insert(plants)
    .values({
      userId: user.id,
      nickname: NICKNAME,
      taxonId: genus.id,
      accessionNumber: Number(next),
      origin: "purchase",
      acquiredAt: ARRIVAL,
      notes: "Planta de demonstração gerada pelo seed (pnpm db:seed:demo).",
    })
    .returning();
  await tx.insert(plantLocations).values({ plantId: created!.id, placeId: porch!.id, validFrom: ARRIVAL });
  return created!;
});

// mudanças pelo caminho normal: fecham o período e registram o evento "moved"
await movePlant(plant.id, user.id, { placeId: indoors!.id, validFrom: TO_INDOORS });
await movePlant(plant.id, user.id, { placeId: porch!.id, validFrom: BACK_OUTSIDE });

// ─── Fotos ───────────────────────────────────────────────────────────────────

for (const item of manifest) {
  const buf = await readFile(join(photoDir, item.arquivo));
  const file = new File([buf], item.arquivo, { type: "image/jpeg" });
  await savePhoto({
    plantId: plant.id,
    userId: user.id,
    file,
    meta: { source: "upload", takenAt: at(item.data), ...HOME, caption: item.nota },
  });
}

// ─── Eventos ─────────────────────────────────────────────────────────────────

type EventRow = typeof events.$inferInsert;
const event = (type: EventType, local: string, notes: string | null, extra: Partial<EventRow> = {}): EventRow => ({
  plantId: plant.id,
  userId: user.id,
  type,
  occurredAt: at(local),
  notes,
  ...extra,
});

const story: EventRow[] = [
  event("repotting", "2025-10-24T17:10", "Replante na chegada: casca de pinus média, um pouco de esfagno no fundo."),
  event("note", "2025-11-02T09:45", "Adaptou bem à varanda; folhas firmes."),
  event("new_growth", "2025-12-20T08:25", "Ponta da haste floral aparecendo."),
  event("bloom_start", "2026-01-24T11:15", "Primeiras flores abertas.", { data: { flowers: 2 } }),
  event("disease", "2026-02-17T08:40", "Mancha amarelada numa folha de baixo. Isolei por precaução e cortei a ventilação direta."),
  event("note", "2026-02-24T18:10", "A mancha não espalhou."),
  event("bloom_end", "2026-03-21T17:50", "Flores velhas caindo; fim da primeira floração."),
  event("new_growth", "2026-04-18T10:20", "Haste cortada. Folha nova despontando no centro."),
  event("new_root", "2026-05-09T08:55", "Raiz nova saindo pela lateral do vaso."),
  event("pest", "2026-06-16T19:30", "Cochonilha algodonosa na base das folhas."),
  event("treatment", "2026-06-17T09:00", "Limpeza com cotonete e álcool 70%, depois óleo de neem.", { data: { product: "Óleo de neem" } }),
  event("treatment", "2026-07-01T09:15", "Segunda aplicação de óleo de neem.", { data: { product: "Óleo de neem" } }),
  event("keiki", "2026-07-22T20:00", "Keiki brotando na base, ao lado da folha mais velha."),
  event("note", "2026-07-30T20:30", "Nenhum sinal de cochonilha desde o segundo tratamento."),
  event("new_growth", "2026-08-08T09:40", "Outra folha nova no centro."),
  event("new_growth", "2026-08-19T07:45", "Nova haste floral."),
  event("bloom_start", "2026-10-03T10:15", "Segunda floração: primeiras flores abertas.", { data: { flowers: 2 } }),
];

// Rega e adubação ao longo do ano; no inverno, dentro de casa, rega mais espaçada e sem adubo.
// Parte vai em lote (batch_id), como se fosse registrada para o lugar inteiro.
const care: EventRow[] = [];
const today = new Date();
let lastFertilizing = ARRIVAL.getTime();
for (let t = ARRIVAL.getTime() + 2 * DAY; t < today.getTime() - DAY; ) {
  const day = new Date(t);
  const winter = day >= TO_INDOORS && day < BACK_OUTSIDE;
  const hour = rng() < 0.7 ? 8 : 18;
  const when = new Date(Math.floor((t - 3 * 3_600_000) / DAY) * DAY + (hour + 3) * 3_600_000 + Math.floor(rng() * 50) * 60_000);
  const batchId = rng() < 0.4 ? randomUUID() : null;
  care.push({ plantId: plant.id, userId: user.id, type: "watering", occurredAt: when, notes: null, batchId });
  if (!winter && t - lastFertilizing >= 14 * DAY) {
    lastFertilizing = t;
    const fertBatch = rng() < 0.5 ? randomUUID() : null;
    care.push({
      plantId: plant.id,
      userId: user.id,
      type: "fertilizing",
      occurredAt: new Date(when.getTime() + 5 * 60_000),
      notes: fertBatch ? null : "NPK 20-20-20, meia dose.",
      batchId: fertBatch,
    });
  }
  t += Math.round((winter ? between(7, 10) : between(4, 6)) * DAY);
}
await db.insert(events).values([...story, ...care]);

// ─── Medições manuais ────────────────────────────────────────────────────────

// Dentro de casa: a cada 2–4 dias, de manhã ou à noite, parte delas como medição do lugar.
const readings: Array<typeof manualReadings.$inferInsert> = [];
for (let t = TO_INDOORS.getTime() + DAY; t < BACK_OUTSIDE.getTime() - DAY; t += Math.round(between(2, 4)) * DAY) {
  const night = rng() < 0.5;
  const date = new Date(Math.floor((t - 3 * 3_600_000) / DAY) * DAY + ((night ? 21 : 9) + 3) * 3_600_000);
  const ofPlace = rng() < 0.3;
  readings.push({
    userId: user.id,
    ...(ofPlace ? { placeId: indoors!.id } : { plantId: plant.id }),
    measuredAt: date,
    temperature: round1(night ? between(16, 20) : between(19, 23.5)),
    humidity: Math.round(between(42, 62)),
  });
}
// Na varanda: uma ou duas por mês.
for (const local of ["2025-11-15T08:10", "2025-12-28T21:30", "2026-01-30T13:40", "2026-02-21T07:50", "2026-03-18T20:15", "2026-04-25T08:30", "2026-05-22T06:45", "2026-09-20T21:00", "2026-10-11T14:20"]) {
  const hour = Number(local.slice(11, 13));
  const night = hour >= 19 || hour < 8;
  readings.push({
    userId: user.id,
    plantId: plant.id,
    measuredAt: at(local),
    temperature: round1(night ? between(12, 19) : between(21, 30)),
    humidity: Math.round(between(55, 85)),
  });
}
await db.insert(manualReadings).values(readings);

console.log(
  `Planta FAKE criada: ${manifest.length} fotos, ${story.length + care.length} eventos (${care.filter((e) => e.batchId).length} em lote), ${readings.length} medições, 2 mudanças de lugar.`,
);

// ─── Clima real do ano inteiro ───────────────────────────────────────────────

console.log("Buscando o clima no Open-Meteo...");
const weather = await collectWeather();
console.log(`Clima: ${weather.daysSaved} dias gravados em ${weather.requests} requisições.`);
for (const e of weather.errors) console.warn(`  erro em ${e.locationId}: ${e.error}`);

await sqlClient.end();
