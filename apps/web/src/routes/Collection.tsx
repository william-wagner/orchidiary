import { joinsBatch } from "@orchidiary/shared";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { OriginFlag } from "../components/OriginFlag.tsx";
import { PlaceBatchSheet } from "../components/PlaceBatchSheet.tsx";
import { PlantTaxon, plantOrigin } from "../components/Taxon.tsx";
import { Icon, PageHeader, PressedOrchid } from "../components/ui.tsx";
import { api, type CollectionPlant, illustrationUrl, photoUrl } from "../lib/api.ts";
import { accession, environmentLabel } from "../lib/format.ts";

/** Lugares onde há plantas agora, com quantas estão em cada um, em ordem alfabética. */
function placesOf(plants: CollectionPlant[]) {
  const by = new Map<string, { id: string; name: string; count: number }>();
  for (const p of plants) {
    const loc = p.currentLocation;
    if (!loc?.placeId || !loc.placeName) continue;
    const place = by.get(loc.placeId) ?? { id: loc.placeId, name: loc.placeName, count: 0 };
    place.count++;
    by.set(loc.placeId, place);
  }
  return [...by.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

const placeChip = "inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[0.86rem] whitespace-nowrap transition-colors";

export function Collection() {
  const plants = useQuery({ queryKey: ["plants"], queryFn: () => api.get<CollectionPlant[]>("/plants") });
  const count = plants.data?.length ?? 0;
  // O lugar escolhido fica na URL: voltar de uma planta mantém o filtro
  const [params, setParams] = useSearchParams();
  const [batchOpen, setBatchOpen] = useState(false);
  const places = useMemo(() => placesOf(plants.data ?? []), [plants.data]);
  const place = places.find((p) => p.id === params.get("local")) ?? null;
  // índice de conforto: o chip só aparece se alguma planta tem índice (com faixa na ficha)
  const hasComfort = (plants.data ?? []).some((p) => p.comfort !== null);
  const outOfRange = (plants.data ?? []).filter((p) => p.comfort?.length);
  const comfortFilter = !place && hasComfort && params.get("conforto") === "fora";
  // ao ar livre: ambiente do período atual (o do lugar, ou o da planta sem lugar)
  const outdoor = (plants.data ?? []).filter((p) => p.currentLocation?.environment === "outdoor");
  const outdoorFilter = !place && !comfortFilter && outdoor.length > 0 && params.get("ambiente") === "ar-livre";
  const allOn = !place && !comfortFilter && !outdoorFilter;
  const shown = place
    ? (plants.data ?? []).filter((p) => p.currentLocation?.placeId === place.id)
    : comfortFilter
      ? outOfRange
      : outdoorFilter
        ? outdoor
        : plants.data;
  const batchable = shown?.filter((p) => joinsBatch(p.status)).length ?? 0;
  const choose = (id: string | null) => setParams(id ? { local: id } : {}, { replace: true });
  const chooseOutOfRange = () => setParams({ conforto: "fora" }, { replace: true });
  const chooseOutdoor = () => setParams({ ambiente: "ar-livre" }, { replace: true });

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

      {(places.length > 0 || outdoor.length > 0) && (
        <div className="mb-5 px-5">
          <div role="toolbar" aria-label="Filtrar por lugar" className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
            <button
              aria-pressed={allOn}
              onClick={() => choose(null)}
              className={`${placeChip} ${allOn ? "border-tinta bg-tinta text-folha" : "border-contorno bg-folha text-folhagem active:bg-salvia-clara"}`}
            >
              Todas <span className={`typed text-[0.72rem] ${allOn ? "text-salvia" : ""}`}>{count}</span>
            </button>
            {outdoor.length > 0 && (
              <button
                aria-pressed={outdoorFilter}
                onClick={chooseOutdoor}
                className={`${placeChip} ${outdoorFilter ? "border-tinta bg-tinta text-folha" : "border-contorno bg-folha text-folhagem active:bg-salvia-clara"}`}
              >
                <Icon name="sun" className="size-3.5" />
                Ao ar livre <span className={`typed text-[0.72rem] ${outdoorFilter ? "text-salvia" : ""}`}>{outdoor.length}</span>
              </button>
            )}
            {hasComfort && (
              <button
                aria-pressed={comfortFilter}
                onClick={chooseOutOfRange}
                className={`${placeChip} ${comfortFilter ? "border-ocre bg-ocre text-folha" : "border-dashed border-ocre bg-folha text-ocre active:bg-ocre-claro"}`}
              >
                <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
                Fora da faixa <span className={`typed text-[0.72rem] ${comfortFilter ? "text-ocre-claro" : "text-ocre"}`}>{outOfRange.length}</span>
              </button>
            )}
            {places.map((pl) => {
              const on = pl.id === place?.id;
              return (
                <button
                  key={pl.id}
                  aria-pressed={on}
                  onClick={() => choose(pl.id)}
                  className={`${placeChip} ${on ? "border-tinta bg-tinta text-folha" : "border-contorno bg-folha text-folhagem active:bg-salvia-clara"}`}
                >
                  <Icon name="pin" className="size-3.5" />
                  {pl.name} <span className={`typed text-[0.72rem] ${on ? "text-salvia" : ""}`}>{pl.count}</span>
                </button>
              );
            })}
          </div>

          {comfortFilter && (
            <p className="mt-3 text-[0.82rem] text-musgo">
              Plantas com 3 ou mais dias fora da faixa da ficha na última semana. Para as que estão dentro de casa, o clima comparado é o de fora,
              só como referência. Avisos silenciados não entram.
            </p>
          )}

          {place && (
            <div className="mt-3.5 flex items-center justify-between gap-3 rounded-lg border border-linha bg-salvia-clara py-3 pr-3 pl-4">
              <div className="min-w-0">
                <p className="truncate font-serif text-[1.1rem] leading-tight">{place.name}</p>
                <p className="typed mt-0.5 text-[0.72rem]">
                  {place.count} {place.count === 1 ? "planta" : "plantas"} aqui agora
                </p>
              </div>
              <button
                onClick={() => setBatchOpen(true)}
                disabled={batchable === 0}
                className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-tinta px-4 text-[0.88rem] font-medium text-folha active:bg-tinta-viva disabled:opacity-45"
              >
                <Icon name="layers" className="size-4" />
                Registrar no local
              </button>
            </div>
          )}
        </div>
      )}

      {comfortFilter && shown?.length === 0 && (
        <p className="mx-5 rounded-lg border border-dashed border-contorno px-5 py-8 text-center text-musgo">Nenhuma planta fora da faixa nesta semana.</p>
      )}

      <ul className="grid grid-cols-2 gap-x-3 gap-y-4 px-5 sm:grid-cols-3">
        {shown?.map((p) => (
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
                  {p.comfort?.[0] && (
                    <span className="selo selo-ocre" title={`${p.comfort[0].count} de 7 dias fora da faixa da ficha${p.currentLocation?.environment === "indoor" ? " (clima de fora, só referência)" : ""}`}>
                      {p.comfort[0].label}
                      {p.comfort.length > 1 && ` +${p.comfort.length - 1}`}
                    </span>
                  )}
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

      {batchOpen && place && shown && <PlaceBatchSheet place={place} plants={shown} onClose={() => setBatchOpen(false)} />}
    </main>
  );
}
