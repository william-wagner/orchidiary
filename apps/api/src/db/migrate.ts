import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db, sqlClient } from "./client.ts";

await migrate(db, { migrationsFolder: new URL("../../drizzle", import.meta.url).pathname });

// Plantas cadastradas antes do número de tombo existir recebem um,
// na ordem em que foram cadastradas, sem colidir com números já usados.
await db.execute(sql`
  update plants p
  set accession_number = sub.n
  from (
    select id,
           coalesce((select max(accession_number) from plants m where m.user_id = x.user_id), 0)
             + row_number() over (partition by user_id order by created_at) as n
    from plants x
    where accession_number is null
  ) sub
  where p.id = sub.id
`);

console.log("Migrações aplicadas.");
await sqlClient.end();
