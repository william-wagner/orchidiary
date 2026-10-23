import { CROSS_SIDE_LABEL } from "@orchidiary/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { api, type CrossSideView, type Plant } from "../lib/api.ts";
import { useCatalogMatch } from "./Determination.tsx";
import { OriginFlag } from "./OriginFlag.tsx";
import { TaxonName } from "./Taxon.tsx";
import { Icon } from "./ui.tsx";

/** Parentais na etiqueta da exsicata, cada um com a sua origem; o selo marca de onde vem a ficha. */
export function ParentsList({ plant }: { plant: Pick<Plant, "cross" | "care"> }) {
  const cross = plant.cross;
  if (!cross) return null;
  const row = (label: string, side: CrossSideView, isCare: boolean) => (
    <div className="flex items-baseline gap-2">
      <dt className="font-mono text-[0.66rem] tracking-[0.1em] whitespace-nowrap text-musgo uppercase">{label}</dt>
      <span className="leader" />
      <dd className="min-w-0 text-right font-serif [overflow-wrap:anywhere]">
        {side && "taxon" in side ? (
          <>
            <TaxonName lineage={side.taxon.lineage} /> <OriginFlag origin={side.taxon.origin} />
          </>
        ) : side ? (
          <>
            <span className="taxon">{side.text}</span> <span className="selo align-middle font-sans">fora do catálogo</span>
          </>
        ) : (
          <span className="text-musgo">? desconhecido</span>
        )}
        {isCare && <span className="selo selo-flor ml-1.5 align-middle font-sans">ficha</span>}
      </dd>
    </div>
  );
  const careSide = plant.care?.side ?? null;
  return (
    <div className="mt-3">
      <dl className="grid gap-1.5 text-[0.95rem]">
        {!cross.seed && !cross.pollen ? (
          <div className="flex items-baseline gap-2">
            <dt className="font-mono text-[0.66rem] tracking-[0.1em] text-musgo uppercase">Parentais</dt>
            <span className="leader" />
            <dd className="text-musgo">desconhecidos</dd>
          </div>
        ) : (
          <>
            {row("♀ semente", cross.seed, careSide === "seed")}
            {row("♂ pólen", cross.pollen, careSide === "pollen")}
          </>
        )}
      </dl>
      {cross.source === "taxon" && <p className="typed mt-1 text-[0.68rem]">parentais do grex, pelo catálogo</p>}
    </div>
  );
}

/**
 * O nome como veio na etiqueta (quando não é ele o título) e, se ele bate com um táxon do catálogo
 * mais específico que o atual, a sugestão de troca. Trocar a determinação troca a genealogia junto.
 */
export function ReceivedName({ plant }: { plant: Pick<Plant, "id" | "receivedName" | "taxonId" | "crossId"> }) {
  const qc = useQueryClient();
  const match = useCatalogMatch(plant.receivedName ?? "", plant.crossId ? null : plant.taxonId);
  const relink = useMutation({
    mutationFn: (taxonId: string) => api.patch(`/plants/${plant.id}`, { taxonId, cross: null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["timeline", plant.id] });
      qc.invalidateQueries({ queryKey: ["plants"] });
    },
  });
  if (!plant.receivedName || (!plant.taxonId && !plant.crossId)) return null;
  return (
    <div className="mt-3">
      <div className="flex items-baseline gap-2 text-[0.95rem]">
        <span className="font-mono text-[0.66rem] tracking-[0.1em] text-musgo uppercase">Etiqueta</span>
        <span className="leader" />
        <span className="typed text-right text-[0.82rem]">“{plant.receivedName}”</span>
      </div>
      {match && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-md bg-salvia-clara px-3 py-2 text-[0.86rem]">
          <span>
            A etiqueta diz <TaxonName lineage={match.lineage} />, que está no catálogo.
            {plant.crossId && " Usar troca a cruza pelo táxon, e os parentais anotados saem."}
          </span>
          <button
            type="button"
            disabled={relink.isPending}
            className="min-h-10 rounded-lg border border-contorno px-3 text-tinta active:bg-folha disabled:opacity-45"
            onClick={() => relink.mutate(match.id)}
          >
            Usar como espécie
          </button>
        </div>
      )}
    </div>
  );
}

/** "Ver ficha de cultivo" e, quando a ficha vem de um parental, o aviso de que é uma cruza. */
export function CareLink({ plant }: { plant: Pick<Plant, "care" | "crossId"> }) {
  const care = plant.care;
  return (
    <>
      {care && (
        <Link to={`/guia/${care.taxonId}`} className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-[0.9rem] text-orquidea">
          Ver ficha de cultivo
          <Icon name="arrow-right" className="size-4" />
        </Link>
      )}
      {care?.side ? (
        <p className="mt-2 border-t border-dotted border-contorno pt-2.5 text-[0.86rem] text-musgo">
          Ficha de <span className="taxon">{care.fullName}</span> ({CROSS_SIDE_LABEL[care.side]}
          {care.grexId ? " do grex" : ""}), porque esta planta é uma cruza. Cada parental pode pedir cuidados um pouco diferentes:
          observe como ela responde.
        </p>
      ) : (
        !care &&
        plant.crossId && (
          <p className="mt-2 border-t border-dotted border-contorno pt-2.5 text-[0.86rem] text-ocre">
            Sem ficha de cultivo: nenhum parental está no catálogo.
          </p>
        )
      )}
    </>
  );
}
