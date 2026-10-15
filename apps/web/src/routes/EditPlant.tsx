import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { TaxonPicker } from "../components/TaxonPicker.tsx";
import { Button, ErrorText, Field, Input, PageHeader, Select } from "../components/ui.tsx";
import { api, type Photo, type Plant, photoUrl, type TaxonSummary, type Timeline } from "../lib/api.ts";
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
  return <EditForm plant={timeline.data.plant} photos={timeline.data.photos} />;
}

function EditForm({ plant, photos }: { plant: Plant; photos: Photo[] }) {
  const navigate = useNavigate();
  const [cover, setCover] = useState<string | null>(plant.coverPhotoId);
  const qc = useQueryClient();
  const [taxon, setTaxon] = useState<TaxonSummary | null>(plant.taxon);
  const back = `/plantas/${plant.id}`;
  const initialDate = dateValue(plant.acquiredAt);

  const save = useMutation({
    mutationFn: (body: unknown) => api.patch<Plant>(`/plants/${plant.id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["timeline", plant.id] });
      qc.invalidateQueries({ queryKey: ["plants"] });
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
      taxonId: taxon?.id ?? null,
      taxonText: taxon ? null : text("taxonText"),
      origin: text("origin"),
      // só reenvia a data se ela foi mexida, para não deslocar o dia por fuso
      ...(acquiredAt !== initialDate && { acquiredAt: acquiredAt || null }),
      status: f.get("status"),
      substrate: text("substrate"),
      potNotes: text("potNotes"),
      notes: text("notes"),
      coverPhotoId: cover,
    });
  }

  return (
    <main className="pb-8">
      <div className="px-4 pt-3">
        <Link to={back} className="inline-flex min-h-11 items-center">
          Voltar à planta
        </Link>
      </div>
      <PageHeader kicker={accession(plant.accessionNumber)} title="Editar planta" />
      <form onSubmit={onSubmit} className="space-y-5 px-4 pt-5">
        <Field label="Apelido">
          <Input name="nickname" required maxLength={80} defaultValue={plant.nickname} />
        </Field>
        <TaxonPicker value={taxon} onChange={setTaxon} />
        {!taxon && (
          <Field label="Ou o nome livre" hint="Se não achou no catálogo: o que estiver escrito na etiqueta">
            <Input name="taxonText" maxLength={160} defaultValue={plant.taxonText ?? ""} />
          </Field>
        )}
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
            className="w-full border border-linha bg-etiqueta px-3 py-2 font-mono text-[0.95rem] text-tinta focus:border-sepia"
          />
        </Field>

        <fieldset>
          <legend className="mb-1 font-medium">Foto de capa</legend>
          {photos.length === 0 ? (
            <p className="text-[0.95rem] text-pontilhado">Ainda não há fotos. Fotografe a planta para escolher a capa.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setCover(null)}
                aria-pressed={cover === null}
                className={`flex aspect-square items-center justify-center border p-2 text-center text-[0.95rem] ${
                  cover === null ? "border-2 border-carimbo text-carimbo" : "border-linha"
                }`}
              >
                A mais recente
              </button>
              {photos.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setCover(p.id)}
                  aria-pressed={cover === p.id}
                  aria-label={`Usar a foto de ${typedDate(p.takenAt)} como capa`}
                  className={`relative aspect-square border ${cover === p.id ? "border-2 border-carimbo" : "border-linha"}`}
                >
                  <img src={photoUrl(p.id, "thumb")} alt="" loading="lazy" className="h-full w-full object-cover" />
                  <span className="typed absolute inset-x-0 bottom-0 bg-etiqueta/85 text-[0.7rem]">
                    {typedDate(p.takenAt)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </fieldset>

        <p className="text-[0.95rem] text-pontilhado">
          Para mudar a planta de lugar, tire uma foto no novo local: o histórico de lugares e de clima é preservado.
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
    </main>
  );
}
