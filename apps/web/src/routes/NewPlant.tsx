import type { Environment } from "@orchidiary/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router";
import { EnvironmentPicker } from "../components/EnvironmentPicker.tsx";
import { type PickedPhoto, PhotoPicker, uploadPhoto } from "../components/PhotoCapture.tsx";
import { PlacePicker, type PlaceRef } from "../components/PlacePicker.tsx";
import { TaxonPicker } from "../components/TaxonPicker.tsx";
import { Button, ErrorText, Field, Input, PageHeader, Select } from "../components/ui.tsx";
import { api, type Plant, type TaxonSummary } from "../lib/api.ts";
import { coords } from "../lib/format.ts";
import { getPosition, type Position } from "../lib/geo.ts";

export function NewPlant() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [taxon, setTaxon] = useState<TaxonSummary | null>(null);
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
    if (!position) return setGeoError("Marque onde a planta está.");
    const f = new FormData(e.currentTarget);
    create.mutate({
      nickname: f.get("nickname"),
      taxonId: taxon?.id ?? null,
      taxonText: taxon ? null : String(f.get("taxonText") ?? "").trim() || null,
      origin: f.get("origin") || null,
      acquiredAt: f.get("acquiredAt") || null,
      location: { lat: position.lat, lng: position.lng, placeId: place?.id ?? null, environment },
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
        <TaxonPicker value={taxon} onChange={setTaxon} />
        {!taxon && (
          <Field label="Ou o nome livre" hint="Se não achou no catálogo: o que estiver escrito na etiqueta">
            <Input name="taxonText" maxLength={160} />
          </Field>
        )}
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

        <EnvironmentPicker value={environment} onChange={setEnvironment} />

        <div className="space-y-2">
          <PlacePicker value={place} onChange={setPlace} />
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

        <ErrorText error={create.error} />
        <Button type="submit" disabled={create.isPending} className="w-full">
          {create.isPending && cover ? "Tombando e enviando a foto…" : "Tombar planta"}
        </Button>
      </form>
    </main>
  );
}
