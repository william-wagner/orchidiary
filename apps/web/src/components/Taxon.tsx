import { type NamePart, taxonNameParts } from "@orchidiary/shared";
import type { Plant, TaxonRef } from "../lib/api.ts";

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

/** Nome da planta: o táxon do catálogo, o nome livre ou "não determinada". */
export function PlantTaxon({ plant, className = "" }: { plant: Pick<Plant, "taxon" | "taxonText">; className?: string }) {
  if (plant.taxon) return <TaxonName lineage={plant.taxon.lineage} className={className} />;
  return <span className={`taxon ${className}`}>{plant.taxonText ?? "Espécie não determinada"}</span>;
}

/** Os níveis logo acima do táxon, de cima para baixo: "Vandeae › Aeridinae › Vanda". */
export function ancestorsLabel(lineage: readonly TaxonRef[], depth = 3) {
  return lineage
    .slice(0, -1)
    .slice(-depth)
    .map((t) => t.fullName)
    .join(" › ");
}
