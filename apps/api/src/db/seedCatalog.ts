import { eq } from "drizzle-orm";
import { hasOwnCare, isSupraspecific, normalizeOrigin, type TaxonNode, taxonFullName, taxonSearchText } from "@orchidiary/shared";
import { refreshDerivedNames } from "../services/taxonomy.ts";
import type { CatalogNode } from "./catalog.ts";
import { catalogOrigins } from "./catalogOrigins.ts";
import { db, schema } from "./client.ts";

const { taxa } = schema;

/**
 * Garante o catálogo no banco sem desfazer o que foi editado:
 *  - táxon que não existe é criado com a ficha do catálogo;
 *  - gênero (ou nível acima) que já existe solto ganha o lugar dele na árvore;
 *  - nomes populares do catálogo são somados aos que já existem;
 *  - a ficha do catálogo só entra em táxon que não tem nenhum campo preenchido;
 *  - a origem (países ou cruzamento) só entra em táxon que ainda não tem uma; países novos do
 *    catálogo são acrescentados quando os gravados são o começo da lista do catálogo.
 * Gêneros e acima são achados pelo nome; espécies e abaixo, pelo pai + nome.
 */
/** `next` continua `current` com mais países (quem foi editado à mão, com outra ordem ou outro país, fica como está). */
const extends_ = (current: string[], next: string[]) =>
  next.length > current.length && current.every((code, i) => next[i] === code);

export async function seedCatalog(tree: CatalogNode[]) {
  const existing = await db.select().from(taxa);
  const higher = new Map(existing.filter((t) => isSupraspecific(t.rank)).map((t) => [`${t.rank}:${t.name}`, t]));
  const byParent = new Map(existing.map((t) => [`${t.parentId}|${t.rank}|${t.name}`, t]));
  const stats = { inserted: 0, updated: 0 };

  async function visit(node: CatalogNode, parent: { id: string; lineage: TaxonNode[] } | null) {
    const lineage = [...(parent?.lineage ?? []), { rank: node.rank, name: node.name }];
    const parentId = parent?.id ?? null;
    const commonNames = node.commonNames ?? [];
    const countries = node.rank === "species" ? catalogOrigins.get(taxonFullName(lineage)) : undefined;
    const origin = normalizeOrigin(node.rank, countries ? { originKind: "country", originCountryCodes: countries } : {});
    const found = isSupraspecific(node.rank)
      ? higher.get(`${node.rank}:${node.name}`)
      : byParent.get(`${parentId}|${node.rank}|${node.name}`);

    let id: string;
    if (!found) {
      const fullName = taxonFullName(lineage);
      const [row] = await db
        .insert(taxa)
        .values({ parentId, rank: node.rank, name: node.name, fullName, searchText: taxonSearchText(fullName, commonNames), commonNames, ...origin, ...node.care })
        .returning({ id: taxa.id });
      id = row!.id;
      stats.inserted++;
    } else {
      id = found.id;
      const patch: Partial<typeof taxa.$inferInsert> = {};
      if (found.parentId === null && parentId) patch.parentId = parentId;
      const missingNames = commonNames.filter((n) => !found.commonNames.includes(n));
      if (missingNames.length) patch.commonNames = [...found.commonNames, ...missingNames];
      if (!found.originKind && origin.originKind) Object.assign(patch, origin);
      else if (found.originKind === "country" && extends_(found.originCountryCodes, origin.originCountryCodes)) {
        patch.originCountryCodes = origin.originCountryCodes;
      }
      if (node.care && !hasOwnCare(found)) Object.assign(patch, node.care);
      if (Object.keys(patch).length) {
        await db.update(taxa).set(patch).where(eq(taxa.id, id));
        stats.updated++;
      }
    }
    for (const child of node.children ?? []) await visit(child, { id, lineage });
  }

  for (const root of tree) await visit(root, null);
  // nomes de quem mudou de lugar (e de quem veio da migração) seguem a árvore
  const renamed = await refreshDerivedNames();
  return { ...stats, renamed };
}
