import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { PageHeader, PressedOrchid } from "../components/ui.tsx";
import { api, type CollectionPlant, illustrationUrl, photoUrl } from "../lib/api.ts";
import { accession, environmentLabel } from "../lib/format.ts";

export function Collection() {
  const plants = useQuery({ queryKey: ["plants"], queryFn: () => api.get<CollectionPlant[]>("/plants") });
  const count = plants.data?.length ?? 0;

  return (
    <main>
      <PageHeader
        kicker={plants.data ? `${count} ${count === 1 ? "espécime tombado" : "espécimes tombados"}` : " "}
        title="Coleção"
        action={
          <Link
            to="/plantas/nova"
            className="flex min-h-11 shrink-0 items-center border-[1.5px] border-carimbo px-3.5 text-lg text-carimbo"
          >
            Tombar planta
          </Link>
        }
      />

      {plants.data?.length === 0 && (
        <div className="herb-label mx-4 mt-5 p-5">
          <p className="text-xl">O herbário está vazio.</p>
          <p className="mt-1">Tombe a primeira orquídea para abrir o livro de registro dela.</p>
        </div>
      )}

      <ul className="space-y-3.5 p-4">
        {plants.data?.map((p) => (
          <li key={p.id}>
            <Link to={`/plantas/${p.id}`} className="relative flex gap-3 border border-linha bg-etiqueta p-2.5">
              <div
                className={`mounted flex h-24 w-20 shrink-0 items-center justify-center overflow-visible ${p.coverIllustratedAt ? "bg-prancha" : ""}`}
              >
                {p.lastPhotoId && p.coverIllustratedAt ? (
                  <img src={illustrationUrl(p.lastPhotoId, p.coverIllustratedAt, "thumb")} alt="" className="h-full w-full object-contain" />
                ) : p.lastPhotoId ? (
                  <img src={photoUrl(p.lastPhotoId, "thumb")} alt="" className="h-full w-full object-cover" />
                ) : (
                  <PressedOrchid className="h-16 w-10" />
                )}
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className="typed text-[0.78rem]">{accession(p.accessionNumber)}</p>
                <p className="taxon truncate text-xl leading-tight">{p.taxonText ?? "Espécie não determinada"}</p>
                <p className="truncate">{p.nickname}</p>
                <p className="typed mt-auto truncate text-[0.78rem]">
                  {p.currentLocation?.label ? `${p.currentLocation.label}, ` : ""}
                  {environmentLabel(p.currentLocation?.environment)}
                </p>
              </div>
              {p.inBloom && <span className="stamp absolute top-2.5 right-2.5 rotate-6">em flor</span>}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
