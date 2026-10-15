import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { MovePrompt } from "../components/MovePrompt.tsx";
import { PhotoCapture } from "../components/PhotoCapture.tsx";
import { TemperatureRegister } from "../components/TemperatureRegister.tsx";
import { Button, ErrorText, Field, Input, PressedOrchid } from "../components/ui.tsx";
import { api, type LocationCheck, type Photo, photoUrl, type Timeline } from "../lib/api.ts";
import { accession, environmentLabel, monthHeading, typedDate } from "../lib/format.ts";

const EVENT_LABEL: Record<string, string> = {
  note: "Anotação",
  watering: "Rega",
  fertilizing: "Adubação",
  repotting: "Replante",
  bloom_start: "Começou a florir",
  bloom_end: "Fim da floração",
  new_growth: "Broto novo",
  new_root: "Raiz nova",
  keiki: "Keiki",
  pest: "Praga",
  disease: "Doença",
  treatment: "Tratamento",
  moved: "Mudou de lugar",
};

/** Eventos que ganham carimbo no livro de registro */
const STAMPED: Record<string, string> = {
  bloom_start: "floração",
  bloom_end: "fim da flor",
  moved: "mudança",
  repotting: "replante",
  keiki: "keiki",
};

const QUICK_EVENTS = ["watering", "fertilizing", "bloom_start", "new_growth"] as const;

type Item =
  | { kind: "photo"; at: string; photo: Photo }
  | { kind: "event"; at: string; id: string; type: string; notes: string | null }
  | { kind: "reading"; at: string; id: string; temperature: number | null; humidity: number | null };

const chip = "min-h-11 border border-sepia bg-transparent px-3 text-[1.02rem] active:bg-etiqueta";

export function PlantDetail() {
  const { id } = useParams();
  const qc = useQueryClient();
  const timeline = useQuery({ queryKey: ["timeline", id], queryFn: () => api.get<Timeline>(`/plants/${id}/timeline`) });
  const [pendingMove, setPendingMove] = useState<{ check: LocationCheck; takenAt: string } | null>(null);
  const [showReading, setShowReading] = useState(false);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["timeline", id] });
    qc.invalidateQueries({ queryKey: ["plants"] });
  };

  const addEvent = useMutation({
    mutationFn: (type: string) => api.post(`/plants/${id}/events`, { type }),
    onSuccess: refresh,
  });

  const items = useMemo<Item[]>(() => {
    const t = timeline.data;
    if (!t) return [];
    return [
      ...t.photos.map((p): Item => ({ kind: "photo", at: p.takenAt, photo: p })),
      ...t.events.map((e): Item => ({ kind: "event", at: e.occurredAt, id: e.id, type: e.type, notes: e.notes })),
      ...t.readings.map(
        (r): Item => ({ kind: "reading", at: r.measuredAt, id: r.id, temperature: r.temperature, humidity: r.humidity }),
      ),
    ].sort((a, b) => b.at.localeCompare(a.at));
  }, [timeline.data]);

  // Agrupa o livro de registro por mês
  const groups = useMemo(() => {
    const out: Array<{ month: string; items: Item[] }> = [];
    for (const it of items) {
      const month = monthHeading(it.at);
      const last = out.at(-1);
      if (last?.month === month) last.items.push(it);
      else out.push({ month, items: [it] });
    }
    return out;
  }, [items]);

  if (!timeline.data) return <p className="typed p-6">Abrindo a exsicata…</p>;
  const { plant, locations, weather } = timeline.data;
  const current = locations.find((l) => l.validTo === null);
  const first = locations[0];
  const cover = plant.coverPhotoId ?? timeline.data.photos[0]?.id;

  return (
    <main className="pb-8">
      <div className="px-4 pt-3">
        <Link to="/" className="inline-flex min-h-11 items-center">
          Voltar à coleção
        </Link>
      </div>

      {/* A exsicata: foto montada na folha e a etiqueta datilografada */}
      <section className="mx-4 flex flex-col gap-3 border border-linha bg-etiqueta p-3.5" aria-label="Exsicata">
        <div className="mounted flex h-60 items-center justify-center">
          {cover ? (
            <img src={photoUrl(cover)} alt={`Foto mais recente de ${plant.nickname}`} className="h-full w-full object-cover" />
          ) : (
            <PressedOrchid className="h-40 w-24" />
          )}
        </div>
        <div className="herb-label px-3 py-2.5">
          <div className="mb-1.5 flex justify-between border-b border-sepia pb-1 text-[0.9rem]">
            <span>Herbário Orchidiary</span>
            <span>{accession(plant.accessionNumber)}</span>
          </div>
          <h1 className="taxon text-[1.6rem] leading-tight">{plant.taxonText ?? "Espécie não determinada"}</h1>
          <p className="text-lg">{plant.nickname}</p>
          <div className="typed mt-1 text-[0.8rem] leading-relaxed">
            {current && (
              <p>
                {current.label ? `${current.label}, ` : ""}
                {environmentLabel(current.environment)}
              </p>
            )}
            {first && <p>Na coleção desde {typedDate(plant.acquiredAt ?? first.validFrom)}</p>}
            {locations.length > 1 && <p>Já passou por {locations.length} lugares</p>}
          </div>
        </div>
      </section>

      <section className="mx-4 mt-5" aria-label="Registro térmico">
        <TemperatureRegister days={weather.slice(-30)} />
        {current?.environment === "indoor" && (
          <p className="mt-2 text-[0.95rem] text-pontilhado">
            Clima de fora, como referência. Dentro de casa vale o que você medir.
          </p>
        )}
      </section>

      <section className="mx-4 mt-5 space-y-3" aria-label="Registrar">
        <PhotoCapture
          plantId={plant.id}
          onSaved={({ photo, locationCheck }) => {
            refresh();
            if (locationCheck?.mismatch) setPendingMove({ check: locationCheck, takenAt: photo.takenAt });
          }}
        />
        <div className="flex flex-wrap gap-2">
          {QUICK_EVENTS.map((t) => (
            <button key={t} onClick={() => addEvent.mutate(t)} disabled={addEvent.isPending} className={chip}>
              {EVENT_LABEL[t]}
            </button>
          ))}
          <button onClick={() => setShowReading((v) => !v)} className={chip} aria-expanded={showReading}>
            Temperatura e umidade
          </button>
        </div>
        {showReading && (
          <ReadingForm
            plantId={plant.id}
            onSaved={() => {
              setShowReading(false);
              refresh();
            }}
          />
        )}
      </section>

      <section className="mx-4 mt-7" aria-label="Livro de registro">
        <h2 className="border-b border-sepia pb-1 text-xl font-medium">Livro de registro</h2>
        {items.length === 0 && (
          <p className="mt-3">Nenhum registro ainda. Fotografe a planta para abrir o livro dela.</p>
        )}
        {groups.map((g) => (
          <div key={g.month}>
            <h3 className="mt-4 mb-1 text-pontilhado italic first-letter:uppercase">{g.month}</h3>
            <ol>
              {g.items.map((it) => (
                <li
                  key={`${it.kind}-${it.kind === "photo" ? it.photo.id : it.id}`}
                  className="flex items-baseline gap-3 border-b border-dotted border-linha py-2"
                >
                  <span className="typed w-[5.6rem] shrink-0 text-[0.78rem]">{typedDate(it.at)}</span>
                  <div className="min-w-0 flex-1">
                    {it.kind === "photo" && (
                      <>
                        <p>Fotografia{it.photo.caption ? `: ${it.photo.caption}` : ""}</p>
                        <img
                          src={photoUrl(it.photo.id, "thumb")}
                          alt=""
                          loading="lazy"
                          className="mt-1.5 w-full max-w-[14rem] border border-linha"
                        />
                      </>
                    )}
                    {it.kind === "event" && (
                      <p>
                        {EVENT_LABEL[it.type] ?? it.type}
                        {it.notes && <span className="block text-pontilhado">{it.notes}</span>}
                      </p>
                    )}
                    {it.kind === "reading" && (
                      <p>
                        Medição:{" "}
                        <span className="typed text-[0.9rem]">
                          {[
                            it.temperature != null ? `${it.temperature} °C` : null,
                            it.humidity != null ? `${it.humidity}%` : null,
                          ]
                            .filter(Boolean)
                            .join(", ")}
                        </span>
                      </p>
                    )}
                  </div>
                  {it.kind === "event" && STAMPED[it.type] && <span className="stamp shrink-0">{STAMPED[it.type]}</span>}
                </li>
              ))}
            </ol>
          </div>
        ))}
      </section>

      {pendingMove && (
        <MovePrompt
          plantId={plant.id}
          check={pendingMove.check}
          takenAt={pendingMove.takenAt}
          onDone={() => {
            setPendingMove(null);
            refresh();
          }}
        />
      )}
    </main>
  );
}

function ReadingForm({ plantId, onSaved }: { plantId: string; onSaved: () => void }) {
  const save = useMutation({
    mutationFn: (body: unknown) => api.post(`/plants/${plantId}/readings`, body),
    onSuccess: onSaved,
  });
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const num = (k: string) => (f.get(k) === "" ? null : Number(f.get(k)));
    save.mutate({ temperature: num("temperature"), humidity: num("humidity") });
  }
  return (
    <form onSubmit={onSubmit} className="herb-label space-y-3 p-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Temperatura (°C)">
          <Input name="temperature" type="number" step="0.1" inputMode="decimal" />
        </Field>
        <Field label="Umidade (%)">
          <Input name="humidity" type="number" step="1" min="0" max="100" inputMode="numeric" />
        </Field>
      </div>
      <ErrorText error={save.error} />
      <Button type="submit" disabled={save.isPending} className="w-full">
        Anotar medição
      </Button>
    </form>
  );
}
