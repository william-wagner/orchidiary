import type { Environment } from "@orchidiary/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router";
import { EnvironmentPicker } from "../components/EnvironmentPicker.tsx";
import { BackLink, Button, ErrorText, Field, Input } from "../components/ui.tsx";
import { api, type Place } from "../lib/api.ts";
import { coords } from "../lib/format.ts";
import { getPosition, type Position } from "../lib/geo.ts";

/**
 * Cadastro do lugar: nome, ambiente e onde ele fica.
 * A partir daqui o clima dele já começa a ser coletado, mesmo sem planta nenhuma.
 */
export function NewPlace() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [environment, setEnvironment] = useState<Environment>("outdoor");
  const [position, setPosition] = useState<Position | null>(null);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const locality = useQuery({
    queryKey: ["reverse-geocode", position?.lat, position?.lng],
    queryFn: () => api.get<{ label: string | null }>(`/geo/reverse?lat=${position!.lat}&lng=${position!.lng}`),
    enabled: !!position,
    staleTime: Infinity,
    retry: false,
  });

  const create = useMutation({
    mutationFn: (body: unknown) => api.post<Place>("/places", body),
    onSuccess: (place) => {
      qc.invalidateQueries({ queryKey: ["places"] });
      navigate(`/lugares/${place.id}`, { replace: true });
    },
  });

  async function locate() {
    setLocating(true);
    setGeoError(null);
    const p = await getPosition();
    setLocating(false);
    if (p) setPosition(p);
    else setGeoError("Não foi possível obter a localização. Confira a permissão do navegador (é preciso abrir o app por https).");
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!position) return setGeoError("Marque onde este lugar fica.");
    const f = new FormData(e.currentTarget);
    create.mutate({ name: f.get("name"), environment, lat: position.lat, lng: position.lng });
  }

  return (
    <main>
      <div className="px-5 pt-4">
        <Link to="/lugares">
          <BackLink>Lugares</BackLink>
        </Link>
      </div>
      <header className="mx-5 pt-2 pb-5">
        <p className="eyebrow">Cadastrar lugar</p>
        <h1 className="mt-1.5 text-[2.4rem] leading-[1.05] tracking-[-0.03em]">Novo lugar</h1>
      </header>

      <form onSubmit={onSubmit} className="space-y-5 px-5 pb-8">
        <Field label="Nome do lugar" hint="Como você chama esse canto. Ex.: Orquidário quarto">
          <Input name="name" required maxLength={120} placeholder="Ex.: Varanda dos fundos" />
        </Field>

        <EnvironmentPicker value={environment} onChange={setEnvironment} label="Ambiente do lugar" />

        <div className="space-y-2">
          <span className="block font-mono text-[0.74rem] tracking-[0.02em] text-folhagem">Onde fica</span>
          <Button type="button" variant="quiet" onClick={locate} disabled={locating} className="w-full">
            {locating ? "Localizando…" : position ? "Marcar de novo" : "Marcar minha localização atual"}
          </Button>
          {position && (
            <div className="typed text-[0.85rem]">
              {locality.data?.label && <p>{locality.data.label}</p>}
              <p>
                {coords(position)} (precisão de {Math.round(position.accuracy)} m)
              </p>
            </div>
          )}
          {geoError && <p className="text-alerta">{geoError}</p>}
        </div>

        <p className="rounded-lg bg-salvia-clara px-4 py-3 text-[0.85rem] text-tinta">
          O clima deste lugar começa a ser coletado agora, mesmo sem planta nenhuma aqui. Toda planta registrada
          nele passa a usar esta localização e este ambiente.
        </p>

        <ErrorText error={create.error} />
        <Button type="submit" disabled={create.isPending} className="w-full">
          Cadastrar lugar
        </Button>
      </form>
    </main>
  );
}
