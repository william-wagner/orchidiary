import { eq } from "drizzle-orm";
import { hashPassword } from "../auth/password.ts";
import { catalog } from "./catalog.ts";
import { db, schema, sqlClient } from "./client.ts";
import { seedCatalog } from "./seedCatalog.ts";

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

// Catálogo do Guia de Cultivo: idempotente, não desfaz edições (ver seedCatalog)
const result = await seedCatalog(catalog);
console.log(`Catálogo de táxons: ${result.inserted} criados, ${result.updated} completados, ${result.renamed} renomeados.`);
await sqlClient.end();
