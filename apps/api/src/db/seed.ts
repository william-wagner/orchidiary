import { eq } from "drizzle-orm";
import { hashPassword } from "../auth/password.ts";
import { db, schema, sqlClient } from "./client.ts";

const email = process.env.MASTER_EMAIL?.toLowerCase();
const password = process.env.MASTER_PASSWORD;
if (!email || !password) {
  console.error("Defina MASTER_EMAIL e MASTER_PASSWORD no .env");
  process.exit(1);
}

const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
if (existing) {
  await db.update(schema.users).set({ role: "master" }).where(eq(schema.users.id, existing.id));
  console.log(`Usuário ${email} já existe — garantido como master.`);
} else {
  await db.insert(schema.users).values({
    email,
    name: process.env.MASTER_NAME ?? "Master",
    role: "master",
    passwordHash: await hashPassword(password),
  });
  console.log(`Usuário master ${email} criado.`);
}

/**
 * Fichas iniciais do Guia de Cultivo — pontos de partida, para revisar e
 * completar. Faixas em °C e % de umidade relativa.
 */
const fichas: Array<typeof schema.species.$inferInsert> = [
  {
    genus: "Cattleya",
    epithet: "walkeriana",
    displayName: "Cattleya walkeriana",
    commonNames: ["walkeriana"],
    tempDayMin: 20,
    tempDayMax: 32,
    tempNightMin: 10,
    tempNightMax: 20,
    humidityMin: 50,
    humidityMax: 80,
    light: "Muita luz, sol da manhã; tolera sol filtrado o dia todo.",
    watering: "Deixar secar bem entre regas; reduzir no repouso de inverno.",
    substrate: "Montada em placa/tronco ou vaso pequeno com casca grossa; drenagem rápida.",
    bloomMonths: [4, 5, 6, 7],
    restPeriod: "Inverno seco e mais frio favorece a floração.",
  },
  {
    genus: "Phalaenopsis",
    displayName: "Phalaenopsis (híbridos)",
    commonNames: ["orquídea-borboleta", "phalaenopsis"],
    tempDayMin: 20,
    tempDayMax: 30,
    tempNightMin: 16,
    tempNightMax: 22,
    humidityMin: 50,
    humidityMax: 80,
    light: "Luz indireta média; sol direto queima as folhas.",
    watering: "Regar quando o substrato estiver quase seco; não deixar água no centro da folha.",
    substrate: "Casca de pinus média, musgo ou mix; vaso com boa drenagem.",
    bloomMonths: [6, 7, 8, 9, 10],
    restPeriod: "Queda de temperatura noturna estimula a haste floral.",
  },
  {
    genus: "Dendrobium",
    epithet: "nobile",
    displayName: "Dendrobium nobile",
    commonNames: ["dendróbio"],
    tempDayMin: 18,
    tempDayMax: 30,
    tempNightMin: 8,
    tempNightMax: 18,
    humidityMin: 50,
    humidityMax: 75,
    light: "Muita luz; tolera algumas horas de sol direto.",
    watering: "Generosa no crescimento; quase seca no outono/inverno para florir.",
    substrate: "Casca grossa com carvão; vaso apertado.",
    bloomMonths: [7, 8, 9, 10],
    restPeriod: "Repouso fresco e seco no inverno é essencial.",
  },
  {
    genus: "Oncidium",
    displayName: "Oncidium / Oncidesa (híbridos)",
    commonNames: ["chuva-de-ouro"],
    tempDayMin: 18,
    tempDayMax: 30,
    tempNightMin: 12,
    tempNightMax: 20,
    humidityMin: 50,
    humidityMax: 80,
    light: "Luz intensa filtrada.",
    watering: "Raízes finas: não deixar secar totalmente no crescimento.",
    substrate: "Casca fina a média com fibra de coco; vaso com drenagem.",
    bloomMonths: [3, 4, 5, 6, 9, 10],
  },
];

await db.insert(schema.species).values(fichas).onConflictDoNothing();
console.log(`${fichas.length} fichas de cultivo garantidas.`);
await sqlClient.end();
