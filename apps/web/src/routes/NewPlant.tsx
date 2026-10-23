import type { Environment } from "@orchidiary/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router";
import { EnvironmentPicker } from "../components/EnvironmentPicker.tsx";
import { type PickedPhoto, PhotoPicker, uploadPhoto } from "../components/PhotoCapture.tsx";
import { PlacePicker, type PlaceRef } from "../components/PlacePicker.tsx";
import {
  type DeterminationDraft,
  determinationBody,
  DeterminationField,
  DeterminationPreview,
  emptyDetermination,
  ReceivedNameField,
} from "../components/Determination.tsx";
import { Button, ErrorText, Field, Input, PageHeader, Select } from "../components/ui.tsx";
import { api, type Plant } from "../lib/api.ts";
import { coords, environmentLabel } from "../lib/format.ts";
import { getPosition, type Position } from "../lib/geo.ts";

export function NewPlant() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [determination, setDetermination] = useState<DeterminationDraft>(emptyDetermination);
  const [receivedName, setReceivedName] = useState("");
  const [environment, setEnvironment] = useState<Environment>("outdoor");
  const [place, setPlace] = useState<PlaceRef | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [cover, setCover] = useState<PickedPhoto | null>(null);

  // Só para mostrar: quem grava a localidade é a API, ao salvar a planta
  const locality = useQuery({
    queryKey: ["reverse-geocode", position?.lat, position?.lng],
    queryFn: () => api.get<{ label: string | null }>(`/geo/reverse?lat=${position!.lat}&lng=${position!.lng}`),
    enabled: !!position,
    staleTime: Infinity,
    retry: false,
  });

  const create = useMutation({
    mutationFn: async (body: unknown) => {
      const plant = await api.post<Plant>("/plants", body);
      // A planta já existe: se a foto falhar, não desfaz o tombo, só avisa na ficha
      let photoError: string | null = null;
      if (cover) {
        try {
          const { photo } = await uploadPhoto(plant.id, cover.file, cover.source, {
            takenAt: cover.takenAt,
            position, // a foto foi tirada onde a planta acabou de ser marcada
          });
          await api.patch(`/plants/${plant.id}`, { coverPhotoId: photo.id });
        } catch (e) {
          photoError = e instanceof Error ? e.message : "Falha ao enviar a foto.";
        }
      }
      return { plant, photoError };
    },
    onSuccess: ({ plant, photoError }) => {
      qc.invalidateQueries({ queryKey: ["plants"] });
      navigate(`/plantas/${plant.id}`, { replace: true, state: photoError ? { photoError } : undefined });
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
    if (!place && !position) return setGeoError("Escolha um lugar ou marque onde a planta está.");
    const f = new FormData(e.currentTarget);
    create.mutate({
      nickname: f.get("nickname"),
      ...determinationBody(determination),
      receivedName: receivedName.trim() || null,
      origin: f.get("origin") || null,
      acquiredAt: f.get("acquiredAt") || null,
      // Num lugar, a localização e o ambiente são os dele; sem lugar, são os da planta.
      location: place ? { placeId: place.id } : { lat: position!.lat, lng: position!.lng, environment },
    });
  }

  return (
    <main>
      <PageHeader kicker="Nova entrada no livro de tombo" title="Tombar planta" />
      <form onSubmit={onSubmit} className="space-y-5 px-5 pb-8">
        <Field label="Apelido" hint="Como você chama esta planta. Ex.: Walkeriana da vó">
          <Input name="nickname" required maxLength={80} />
        </Field>
        <div>
          <span className="mb-1 block font-medium">Foto de capa</span>
          <PhotoPicker value={cover} onChange={setCover} />
          <span className="mt-1 block text-[0.95rem] text-musgo">Opcional. Dá para trocar depois.</span>
        </div>
        <DeterminationField value={determination} onChange={setDetermination} />
        <ReceivedNameField
          value={receivedName}
          onChange={setReceivedName}
          determination={determination}
          onUse={(taxon) => setDetermination({ ...determination, isCross: false, taxon })}
        />
        <DeterminationPreview determination={determination} receivedName={receivedName} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Origem">
            <Select name="origin" defaultValue="">
              <option value="">—</option>
              <option value="purchase">Compra</option>
              <option value="trade">Troca</option>
              <option value="gift">Presente</option>
              <option value="division">Divisão</option>
              <option value="keiki">Keiki</option>
              <option value="seed">Semente</option>
              <option value="rescue">Resgate</option>
              <option value="other">Outra</option>
            </Select>
          </Field>
          <Field label="Chegou em">
            <Input name="acquiredAt" type="date" />
          </Field>
        </div>

        <div className="space-y-3">
          <PlacePicker value={place} onChange={setPlace} newPlace={{ environment, position }} />

          {place ? (
            <div className="cartao px-4 py-3">
              <p className="eyebrow">Vem do lugar</p>
              <dl className="mt-2 space-y-1.5 text-[0.92rem]">
                <div className="flex items-baseline justify-between gap-3">
                  <dt>Ambiente</dt>
                  <dd className={`selo ${place.environment === "indoor" ? "selo-flor" : ""}`}>
                    {environmentLabel(place.environment)}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt>Localização</dt>
                  <dd className="typed text-[0.8rem]">{place.location ? coords(place.location) : "a definir"}</dd>
                </div>
              </dl>
              <p className="mt-2 text-[0.82rem] text-musgo">
                Para mudar qualquer um dos dois, mude no lugar: vale para todas as plantas de lá.
              </p>
            </div>
          ) : (
            <>
              <EnvironmentPicker value={environment} onChange={setEnvironment} />
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
            </>
          )}
        </div>

        <ErrorText error={create.error} />
        <Button type="submit" disabled={create.isPending} className="w-full">
          {create.isPending && cover ? "Tombando e enviando a foto…" : "Tombar planta"}
        </Button>
      </form>
    </main>
  );
}
