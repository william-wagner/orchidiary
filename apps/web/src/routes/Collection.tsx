import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { PageHeader } from "../components/ui.tsx";
import { api, photoUrl, type Plant } from "../lib/api.ts";

export function Collection() {
  const plants = useQuery({ queryKey: ["plants"], queryFn: () => api.get<Plant[]>("/plants") });

  return (
    <main>
      <PageHeader
        title="Minha coleção"
        action={
          <Link to="/plantas/nova" className="rounded-xl bg-labelo px-4 py-2.5 font-semibold text-white">
            Nova planta
          </Link>
        }
      />

      {plants.data?.length === 0 && (
        <div className="mx-4 rounded-2xl border border-dashed border-linha p-6 text-musgo-2">
          <p className="font-serif text-xl text-musgo">Nenhuma planta ainda.</p>
          <p className="mt-1">Cadastre a primeira orquídea para começar o diário dela.</p>
        </div>
      )}

      <ul className="space-y-3 px-4">
        {plants.data?.map((p) => (
          <li key={p.id}>
            <Link to={`/plantas/${p.id}`} className="tag flex items-center gap-3 p-2 pr-10">
              {p.coverPhotoId ? (
                <img src={photoUrl(p.coverPhotoId, "thumb")} alt="" className="size-16 rounded-md object-cover" />
              ) : (
                <div className="size-16 rounded-md bg-velame-2" aria-hidden />
              )}
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold">{p.nickname}</p>
                {p.taxonText && <p className="taxon truncate text-musgo-2">{p.taxonText}</p>}
                <p className="text-sm text-casca">
                  {p.currentLocation?.environment === "indoor" ? "Dentro de casa" : "Ao ar livre"}
                  {p.currentLocation?.label ? `, ${p.currentLocation.label}` : ""}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
