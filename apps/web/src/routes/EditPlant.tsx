import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { CoverSheet } from "../components/CoverSheet.tsx";
import { PlacePicker, type PlaceRef } from "../components/PlacePicker.tsx";
import {
  type DeterminationDraft,
  determinationBody,
  DeterminationField,
  DeterminationPreview,
  determinationOf,
  ReceivedNameField,
} from "../components/Determination.tsx";
import { BackLink, Button, ErrorText, Field, Icon, Input, PageHeader, PressedOrchid, Select } from "../components/ui.tsx";
import {
  api,
  illustrationUrl,
  type Photo,
  type Plant,
  type PlantLocation,
  photoUrl,
  type Timeline,
} from "../lib/api.ts";
import { coverOf, plateOf } from "../lib/cover.ts";
import { accession, typedDate } from "../lib/format.ts";

const STATUS_LABEL: Record<string, string> = {
  active: "Ativa",
  dormant: "Em repouso",
  in_treatment: "Em tratamento",
  given_away: "Doada",
  dead: "Morreu",
};

/** O mesmo formato do <input type="date">, para a data voltar igual a como foi gravada. */
const dateValue = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

export function EditPlant() {
  const { id } = useParams();
  const timeline = useQuery({ queryKey: ["timeline", id], queryFn: () => api.get<Timeline>(`/plants/${id}/timeline`) });
  if (!timeline.data) return <p className="typed p-6">Abrindo a exsicata…</p>;
  const current = timeline.data.locations.find((l) => l.validTo === null) ?? null;
  return <EditForm plant={timeline.data.plant} photos={timeline.data.photos} current={current} />;
}

function EditForm({ plant, photos, current }: { plant: Plant; photos: Photo[]; current: PlantLocation | null }) {
  const navigate = useNavigate();
  const [changingCover, setChangingCover] = useState(false);
  const cover = coverOf(plant, photos);
  const plate = plateOf(cover);
  const qc = useQueryClient();
  const [determination, setDetermination] = useState<DeterminationDraft>(() => determinationOf(plant));
  const [receivedName, setReceivedName] = useState(plant.receivedName ?? "");
  const initialPlaceId = current?.placeId ?? null;
  // o período atual já traz ambiente e coordenadas resolvidos (do lugar, quando há um)
  const [place, setPlace] = useState<PlaceRef | null>(
    current?.placeId && current.placeName
      ? { id: current.placeId, name: current.placeName, environment: current.environment, location: current }
      : null,
  );
  const back = `/plantas/${plant.id}`;
  const initialDate = dateValue(plant.acquiredAt);

  /**
   * Mudar de lugar é uma MUDANÇA, não uma correção: abre um período novo a partir de agora
   * e o histórico anterior (com o clima dele) fica como está. Tirar o lugar mantém a planta
   * onde ela está, agora com localização própria.
   */
  const save = useMutation({
    mutationFn: async (body: unknown) => {
      if ((place?.id ?? null) !== initialPlaceId) {
        await api.post(`/plants/${plant.id}/locations`,
          place
            ? { placeId: place.id }
            : { lat: current!.lat, lng: current!.lng, environment: current!.environment },
        );
      }
      return api.patch<Plant>(`/plants/${plant.id}`, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["timeline", plant.id] });
      qc.invalidateQueries({ queryKey: ["plants"] });
      qc.invalidateQueries({ queryKey: ["places"] });
      navigate(back, { replace: true });
    },
  });

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const text = (k: string) => String(f.get(k) ?? "").trim() || null;
    const acquiredAt = String(f.get("acquiredAt") ?? "");
    save.mutate({
      nickname: f.get("nickname"),
      ...determinationBody(determination),
      receivedName: receivedName.trim() || null,
      origin: text("origin"),
      // só reenvia a data se ela foi mexida, para não deslocar o dia por fuso
      ...(acquiredAt !== initialDate && { acquiredAt: acquiredAt || null }),
      status: f.get("status"),
      substrate: text("substrate"),
      potNotes: text("potNotes"),
      notes: text("notes"),
    });
  }

  return (
    <main className="pb-8">
      <div className="px-5 pt-3">
        <Link to={back}>
          <BackLink>Voltar à planta</BackLink>
        </Link>
      </div>
      <PageHeader kicker={accession(plant.accessionNumber)} title="Editar planta" />
      <form onSubmit={onSubmit} className="space-y-5 px-5">
        <Field label="Apelido">
          <Input name="nickname" required maxLength={80} defaultValue={plant.nickname} />
        </Field>
        <DeterminationField value={determination} onChange={setDetermination} hadCross={plant.cross?.source === "plant"} />
        <ReceivedNameField
          value={receivedName}
          onChange={setReceivedName}
          determination={determination}
          onUse={(taxon) => setDetermination({ ...determination, isCross: false, taxon })}
        />
        <DeterminationPreview determination={determination} receivedName={receivedName} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Origem">
            <Select name="origin" defaultValue={plant.origin ?? ""}>
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
            <Input name="acquiredAt" type="date" defaultValue={initialDate} />
          </Field>
        </div>
        {current && (
          <div className="space-y-2">
            <PlacePicker value={place} onChange={setPlace} newPlace={{ environment: current.environment, position: { lat: current.lat, lng: current.lng, accuracy: 0 } }} />
            {(place?.id ?? null) !== initialPlaceId && (
              <p className="text-[0.84rem] text-ocre">
                {place
                  ? `A planta passa a usar a localização e o ambiente de “${place.name}”, a partir de agora. O histórico anterior fica como está.`
                  : "A planta sai do lugar e passa a ter localização própria, a partir de agora."}
              </p>
            )}
          </div>
        )}
        <Field label="Situação">
          <Select name="status" defaultValue={plant.status}>
            {Object.entries(STATUS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Substrato" hint="Ex.: casca de pinus e carvão">
          <Input name="substrate" maxLength={200} defaultValue={plant.substrate ?? ""} />
        </Field>
        <Field label="Vaso" hint="Ex.: vaso de barro nº 12, com furos laterais">
          <Input name="potNotes" maxLength={500} defaultValue={plant.potNotes ?? ""} />
        </Field>
        <Field label="Anotações">
          <textarea
            name="notes"
            rows={4}
            maxLength={4000}
            defaultValue={plant.notes ?? ""}
            className="w-full rounded-md border border-contorno bg-folha px-3 py-2.5 text-[0.95rem] text-tinta focus:border-tinta focus:outline-none"
          />
        </Field>

        <div>
          <span className="mb-1.5 block font-mono text-[0.74rem] tracking-[0.02em] text-folhagem">Foto de capa</span>
          <div className="flex items-center gap-3.5 rounded-lg border border-contorno bg-folha p-2.5">
            <div className={`aspect-[3/2] w-24 shrink-0 overflow-hidden rounded-md border border-linha ${plate ? "bg-prancha" : "bg-salvia-clara/60"}`}>
              {cover ? (
                <img
                  src={plate ? illustrationUrl(cover.id, plate, "thumb") : photoUrl(cover.id, "thumb")}
                  alt=""
                  className={`h-full w-full ${plate ? "object-contain" : "object-cover"}`}
                />
              ) : (
                <span className="grid h-full place-items-center">
                  <PressedOrchid className="h-9 w-6" />
                </span>
              )}
            </div>
            <div className="min-w-0">
              {cover && <p className="typed mb-1 text-[0.72rem]">{plate ? "Prancha de" : "Foto de"} {typedDate(cover.takenAt)}</p>}
              <Button type="button" variant="quiet" onClick={() => setChangingCover(true)} className="min-h-11 px-4 text-[0.9rem]">
                <Icon name="image" className="size-4" />
                Trocar capa
              </Button>
            </div>
          </div>
        </div>

        <p className="text-[0.85rem] text-musgo">
          O nome do lugar corrige o local atual. Para registrar que a planta mudou de lugar, tire uma foto no novo local: o histórico de lugares e de clima é preservado.
        </p>

        <ErrorText error={save.error} />
        <div className="flex gap-3">
          <Button type="button" variant="quiet" onClick={() => navigate(back)} className="flex-1">
            Cancelar
          </Button>
          <Button type="submit" disabled={save.isPending} className="flex-1">
            Salvar
          </Button>
        </div>
      </form>
      {changingCover && <CoverSheet plant={plant} photos={photos} onClose={() => setChangingCover(false)} />}
    </main>
  );
}
