import type { Environment } from "@orchidiary/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router";
import { EnvironmentPicker } from "../components/EnvironmentPicker.tsx";
import { Button, ErrorText, Field, Input, PageHeader, Select } from "../components/ui.tsx";
import { api, type Plant, type Species } from "../lib/api.ts";
import { getPosition, type Position } from "../lib/geo.ts";

export function NewPlant() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const species = useQuery({ queryKey: ["species"], queryFn: () => api.get<Species[]>("/species") });
  const [environment, setEnvironment] = useState<Environment>("outdoor");
  const [position, setPosition] = useState<Position | null>(null);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: (body: unknown) => api.post<Plant>("/plants", body),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ["plants"] });
      navigate(`/plantas/${p.id}`, { replace: true });
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
    const speciesId = String(f.get("speciesId") || "") || null;
    create.mutate({
      nickname: f.get("nickname"),
      speciesId,
      taxonText: speciesId ? species.data?.find((s) => s.id === speciesId)?.displayName : f.get("taxonText") || null,
      origin: f.get("origin") || null,
      acquiredAt: f.get("acquiredAt") || null,
      location: { lat: position.lat, lng: position.lng, label: f.get("label") || undefined, environment },
    });
  }

  return (
    <main>
      <PageHeader kicker="Nova entrada no livro de tombo" title="Tombar planta" />
      <form onSubmit={onSubmit} className="space-y-5 px-4 pt-5">
        <Field label="Apelido" hint="Como você chama esta planta. Ex.: Walkeriana da vó">
          <Input name="nickname" required maxLength={80} />
        </Field>
        <Field label="Espécie (Guia de Cultivo)">
          <Select name="speciesId" defaultValue="">
            <option value="">Não está no guia</option>
            {species.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.displayName}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Nome, se não estiver no guia" hint="Híbrido, cultivar ou o que estiver na etiqueta">
          <Input name="taxonText" maxLength={160} />
        </Field>
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
          <Field label="Nome do lugar" hint="Opcional. Ex.: Varanda dos fundos">
            <Input name="label" maxLength={120} />
          </Field>
          <Button type="button" variant="quiet" onClick={locate} disabled={locating} className="w-full">
            {locating ? "Localizando…" : position ? "Marcar de novo" : "Marcar minha localização atual"}
          </Button>
          {position && (
            <p className="typed text-[0.85rem]">
              {position.lat.toFixed(4)}, {position.lng.toFixed(4)} (precisão de {Math.round(position.accuracy)} m)
            </p>
          )}
          {geoError && <p className="text-alerta">{geoError}</p>}
        </div>

        <ErrorText error={create.error} />
        <Button type="submit" disabled={create.isPending} className="w-full">
          Tombar planta
        </Button>
      </form>
    </main>
  );
}
