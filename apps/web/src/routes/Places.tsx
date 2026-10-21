import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { PlaceReadout, PlaceSparkline } from "../components/PlaceWeather.tsx";
import { Icon, PageHeader, PressedOrchid } from "../components/ui.tsx";
import { api, type Place } from "../lib/api.ts";
import { coords, environmentLabel } from "../lib/format.ts";
import { formatLocality } from "@orchidiary/shared";

const plantsLabel = (n: number) => (n === 0 ? "nenhuma planta" : n === 1 ? "1 planta" : `${n} plantas`);

/**
 * Lugares do usuário: cada um com ambiente, onde fica e o clima dos últimos 30 dias.
 * Lugar sem planta também aparece — a série dele continua sendo coletada.
 */
export function Places() {
  const places = useQuery({ queryKey: ["places"], queryFn: () => api.get<Place[]>("/places") });
  const count = places.data?.length ?? 0;

  return (
    <main className="pb-8">
      <PageHeader
        kicker={places.data ? `${count} ${count === 1 ? "lugar cadastrado" : "lugares cadastrados"}` : " "}
        title="Lugares"
        action={
          <Link
            to="/lugares/novo"
            aria-label="Cadastrar lugar"
            title="Cadastrar lugar"
            className="grid size-12 shrink-0 place-items-center rounded-full bg-tinta text-folha shadow-caderno active:bg-tinta-viva"
          >
            <Icon name="plus" />
          </Link>
        }
      />

      {places.data?.length === 0 && (
        <div className="mx-5 rounded-xl border border-dashed border-contorno bg-folha px-6 py-12 text-center">
          <PressedOrchid className="mx-auto mb-4 h-16 w-10" />
          <p className="font-serif text-[1.45rem]">Nenhum lugar ainda.</p>
          <p className="mt-1.5 text-musgo">
            Um lugar guarda a localização e o ambiente das plantas que ficam nele, e tem clima próprio.
          </p>
        </div>
      )}

      <div className="space-y-3 px-5">
        {places.data?.map((place) => (
          <Link key={place.id} to={`/lugares/${place.id}`} className="cartao block px-4 py-3.5 active:bg-salvia-clara">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate font-serif text-[1.25rem] leading-tight">{place.name}</h2>
                <p className="typed mt-0.5 text-[0.75rem]">
                  {formatLocality(place.location ?? {}) ?? (place.location ? coords(place.location) : "sem localização")} ·{" "}
                  {plantsLabel(place.plantCount)}
                </p>
              </div>
              <span className={`selo shrink-0 ${place.environment === "indoor" ? "selo-flor" : ""}`}>
                {environmentLabel(place.environment)}
              </span>
            </div>

            {place.location ? (
              <>
                <div className="mt-3">
                  <PlaceReadout days={place.weather ?? []} />
                </div>
                <PlaceSparkline days={place.weather ?? []} className="h-12" />
                {place.plantCount === 0 && (
                  <p className="mt-2 text-[0.82rem] text-musgo">
                    O clima já está sendo registrado. A primeira planta que vier para cá começa com estes dias.
                  </p>
                )}
              </>
            ) : (
              <p className="mt-3 text-[0.82rem] text-ocre">
                Falta dizer onde este lugar fica — sem isso ele não tem clima nem passa localização para as plantas.
              </p>
            )}
          </Link>
        ))}
      </div>
    </main>
  );
}
