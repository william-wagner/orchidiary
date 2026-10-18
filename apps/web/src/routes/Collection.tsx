import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { OriginFlag } from "../components/OriginFlag.tsx";
import { PlantTaxon, plantOrigin } from "../components/Taxon.tsx";
import { Icon, PageHeader, PressedOrchid } from "../components/ui.tsx";
import { api, type CollectionPlant, illustrationUrl, photoUrl } from "../lib/api.ts";
import { accession, environmentLabel } from "../lib/format.ts";

export function Collection() {
  const plants = useQuery({ queryKey: ["plants"], queryFn: () => api.get<CollectionPlant[]>("/plants") });
  const count = plants.data?.length ?? 0;

  return (
    <main className="pb-8">
      <PageHeader
        kicker={plants.data ? `${count} ${count === 1 ? "espécime tombado" : "espécimes tombados"}` : " "}
        title="Coleção"
        action={
          <Link
            to="/plantas/nova"
            aria-label="Tombar planta"
            title="Tombar planta"
            className="grid size-12 shrink-0 place-items-center rounded-full bg-tinta text-folha shadow-caderno active:bg-tinta-viva"
          >
            <Icon name="plus" />
          </Link>
        }
      />

      {plants.data?.length === 0 && (
        <div className="mx-5 rounded-xl border border-dashed border-contorno bg-folha px-6 py-12 text-center">
          <PressedOrchid className="mx-auto mb-4 h-16 w-10" />
          <p className="font-serif text-[1.45rem]">O herbário está vazio.</p>
          <p className="mt-1.5 text-musgo">Tombe a primeira orquídea para abrir o livro de registro dela.</p>
        </div>
      )}

      <ul className="grid grid-cols-2 gap-x-3 gap-y-4 px-5 sm:grid-cols-3">
        {plants.data?.map((p) => (
          <li key={p.id} className="min-w-0">
            <Link
              to={`/plantas/${p.id}`}
              className="flex h-full flex-col overflow-hidden rounded-lg border border-linha bg-folha transition-[border-color,box-shadow] active:border-contorno hover:shadow-caderno"
            >
              <div
                className={`fixada relative flex aspect-[1.04] items-center justify-center overflow-hidden ${
                  p.coverIllustratedAt ? "bg-prancha" : "bg-salvia-clara/60"
                }`}
              >
                {p.lastPhotoId && p.coverIllustratedAt ? (
                  // zoom de 30% na prancha (que tem muita margem de papel); o recorte fica no wrapper para não esconder a fita,
                  // e sem transform para a fita (::before do .fixada) continuar por cima da imagem
                  <div className="flex h-full w-full items-center justify-center overflow-hidden">
                    <img src={illustrationUrl(p.lastPhotoId, p.coverIllustratedAt, "thumb")} alt="" className="h-[130%] w-[130%] max-w-none shrink-0 object-contain" />
                  </div>
                ) : p.lastPhotoId ? (
                  <img src={photoUrl(p.lastPhotoId, "thumb")} alt="" className="h-full w-full object-cover" />
                ) : (
                  <PressedOrchid className="h-20 w-12" />
                )}
                <span className="typed absolute top-2.5 left-2.5 z-[2] rounded-sm bg-folha/80 px-1 text-[0.6rem] tracking-[0.08em] uppercase">
                  {accession(p.accessionNumber)}
                </span>
              </div>
              <div className="flex flex-1 flex-col border-t border-linha px-3 pt-3 pb-3.5">
                <p className="font-serif text-[1.2rem] leading-[1.12] tracking-[-0.01em] [overflow-wrap:anywhere]">
                  <PlantTaxon plant={p} /> <OriginFlag origin={plantOrigin(p)} />
                </p>
                <p className="mt-1 truncate text-[0.8rem] text-musgo">{p.nickname}</p>
                <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-3">
                  {p.inBloom && <span className="selo selo-flor">em flor</span>}
                  <span className="flex min-w-0 items-center gap-1 text-[0.7rem] text-musgo">
                    <Icon name="pin" className="size-3" />
                    <span className="truncate">
                      {p.currentLocation?.placeName ? `${p.currentLocation.placeName}, ` : ""}
                      {environmentLabel(p.currentLocation?.environment)}
                    </span>
                  </span>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
