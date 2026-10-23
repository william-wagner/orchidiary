import { type CrossSideName, crossNameParts, type NamePart, type TaxonOrigin, taxonNameParts, UNNAMED_CROSS, UNKNOWN_PARENTS, UNKNOWN_ORIGIN } from "@orchidiary/shared";
import type { CrossSideView, Plant, PlantCross, TaxonRef } from "../lib/api.ts";

/**
 * Nome científico com o estilo de cada parte: gênero, epíteto e variedade em
 * itálico; "var.", grex e cultivar em redondo ("Vanda Sansai Blue 'Azul Real'").
 */
export function TaxonName({ lineage, className = "" }: { lineage: readonly TaxonRef[]; className?: string }) {
  return <Parts parts={taxonNameParts(lineage)} className={className} />;
}

function Parts({ parts, className }: { parts: NamePart[]; className: string }) {
  return (
    <span className={className}>
      {parts.map((p, i) => (
        <span key={i} className={p.italic ? "taxon" : undefined}>
          {p.text}
        </span>
      ))}
    </span>
  );
}

const sideName = (s: CrossSideView): CrossSideName => (s && "taxon" in s ? { lineage: s.taxon.lineage } : s);
const unknownBoth = (c: Pick<PlantCross, "seed" | "pollen">) => !c.seed && !c.pollen;

/** Fórmula "semente × pólen" (cada táxon no seu estilo; desconhecido é "?"). */
export function CrossFormula({ cross, className = "" }: { cross: Pick<PlantCross, "seed" | "pollen">; className?: string }) {
  return <Parts parts={crossNameParts(sideName(cross.seed), sideName(cross.pollen))} className={className} />;
}

/**
 * Nome da planta: o táxon do catálogo; numa cruza, a fórmula (ou "Cruza sem nome");
 * sem nenhum dos dois, o que veio na etiqueta ou "não determinada".
 */
export function PlantTaxon({ plant, className = "" }: { plant: Pick<Plant, "taxon" | "cross" | "receivedName">; className?: string }) {
  if (plant.taxon) return <TaxonName lineage={plant.taxon.lineage} className={className} />;
  if (plant.cross) {
    if (unknownBoth(plant.cross)) return <span className={className}>{UNNAMED_CROSS}</span>;
    return <CrossFormula cross={plant.cross} className={className} />;
  }
  return <span className={`taxon ${className}`}>{plant.receivedName ?? "Espécie não determinada"}</span>;
}

/**
 * A linha de baixo do nome, quando há: a fórmula de um grex com parentais no catálogo,
 * ou "parentais desconhecidos" de uma cruza sem nome.
 */
export function PlantFormula({ plant, className = "" }: { plant: Pick<Plant, "taxon" | "cross">; className?: string }) {
  if (!plant.cross) return null;
  if (plant.taxon) return <CrossFormula cross={plant.cross} className={className} />;
  if (unknownBoth(plant.cross)) return <span className={className}>{UNKNOWN_PARENTS}</span>;
  return null;
}

/** Origem da planta: cruza é cruzamento; com táxon, a do catálogo; sem nada, desconhecida. */
export const plantOrigin = (plant: Pick<Plant, "taxon" | "crossId">): TaxonOrigin =>
  plant.crossId ? { kind: "cross" } : (plant.taxon?.origin ?? UNKNOWN_ORIGIN);

/** Os níveis logo acima do táxon, de cima para baixo: "Vandeae › Aeridinae › Vanda". */
export function ancestorsLabel(lineage: readonly TaxonRef[], depth = 3) {
  return lineage
    .slice(0, -1)
    .slice(-depth)
    .map((t) => t.fullName)
    .join(" › ");
}
