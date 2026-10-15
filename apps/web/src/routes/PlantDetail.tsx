import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useMemo, useState } from "react";
import { useParams } from "react-router";
import { MovePrompt } from "../components/MovePrompt.tsx";
import { PhotoCapture } from "../components/PhotoCapture.tsx";
import { Button, ErrorText, Field, Input } from "../components/ui.tsx";
import { WeatherStripes } from "../components/WeatherStripes.tsx";
import { api, type LocationCheck, type Photo, photoUrl, type Timeline } from "../lib/api.ts";

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

const QUICK_EVENTS = ["watering", "fertilizing", "bloom_start", "new_growth"] as const;

type Item =
  | { kind: "photo"; at: string; photo: Photo }
  | { kind: "event"; at: string; type: string; notes: string | null }
  | { kind: "reading"; at: string; temperature: number | null; humidity: number | null };

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { day: "numeric", month: "short", year: "numeric" });
const fmtMonth = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

export function PlantDetail() {
  const { id } = useParams();
  const qc = useQueryClient();
  const timeline = useQuery({ queryKey: ["timeline", id], queryFn: () => api.get<Timeline>(`/plants/${id}/timeline`) });
  const [pendingMove, setPendingMove] = useState<{ check: LocationCheck; takenAt: string } | null>(null);
  const [showReading, setShowReading] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["timeline", id] });

  const addEvent = useMutation({
    mutationFn: (type: string) => api.post(`/plants/${id}/events`, { type }),
    onSuccess: refresh,
  });

  const items = useMemo<Item[]>(() => {
    const t = timeline.data;
    if (!t) return [];
    return [
      ...t.photos.map((p): Item => ({ kind: "photo", at: p.takenAt, photo: p })),
      ...t.events.map((e): Item => ({ kind: "event", at: e.occurredAt, type: e.type, notes: e.notes })),
      ...t.readings.map((r): Item => ({ kind: "reading", at: r.measuredAt, temperature: r.temperature, humidity: r.humidity })),
    ].sort((a, b) => b.at.localeCompare(a.at));
  }, [timeline.data]);

  if (!timeline.data) return <p className="p-6 text-musgo-2">Carregando…</p>;
  const { plant, locations, weather } = timeline.data;
  const current = locations.find((l) => l.validTo === null);
  const cover = plant.coverPhotoId ?? timeline.data.photos[0]?.id;

  let lastMonth = "";
  return (
    <main className="pb-8">
      {cover && <img src={photoUrl(cover)} alt="" className="aspect-[4/3] w-full object-cover" />}

      <header className="px-4 pt-5">
        <h1 className="font-serif text-3xl font-semibold">{plant.nickname}</h1>
        {plant.taxonText && <p className="taxon text-lg text-musgo-2">{plant.taxonText}</p>}
        {current && (
          <p className="mt-1 text-casca">
            {current.environment === "indoor" ? "Dentro de casa" : "Ao ar livre"}
            {current.label ? `, ${current.label}` : ""}
            {locations.length > 1 && ` (já passou por ${locations.length} lugares)`}
          </p>
        )}
      </header>

      <section className="mt-4 px-4" aria-label="Clima">
        <WeatherStripes days={weather.slice(-90)} />
        {current?.environment === "indoor" && (
          <p className="mt-2 text-sm text-musgo-2">Clima de fora, como referência. Dentro de casa vale o que você medir.</p>
        )}
      </section>

      <section className="mt-5 space-y-3 px-4" aria-label="Registrar">
        <PhotoCapture
          plantId={plant.id}
          onSaved={({ photo, locationCheck }) => {
            refresh();
            if (locationCheck?.mismatch) setPendingMove({ check: locationCheck, takenAt: photo.takenAt });
          }}
        />
        <div className="flex flex-wrap gap-2">
          {QUICK_EVENTS.map((t) => (
            <button
              key={t}
              onClick={() => addEvent.mutate(t)}
              className="rounded-full border border-linha bg-etiqueta px-3 py-1.5 text-sm font-semibold"
            >
              {EVENT_LABEL[t]}
            </button>
          ))}
          <button
            onClick={() => setShowReading((v) => !v)}
            className="rounded-full border border-linha bg-etiqueta px-3 py-1.5 text-sm font-semibold"
            aria-expanded={showReading}
          >
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

      <section className="mt-8 px-4" aria-label="Linha do tempo">
        <h2 className="font-serif text-2xl font-semibold">Linha do tempo</h2>
        {items.length === 0 && <p className="mt-2 text-musgo-2">Tire a primeira foto para começar a linha do tempo.</p>}
        <ol className="mt-3 border-l-2 border-linha">
          {items.map((it) => {
            const month = fmtMonth(it.at);
            const header = month !== lastMonth ? month : null;
            lastMonth = month;
            return (
              <li key={`${it.kind}-${it.at}-${it.kind === "photo" ? it.photo.id : ""}`} className="relative pb-4 pl-4">
                {header && <p className="-ml-4 mb-2 bg-velame pl-4 font-semibold first-letter:uppercase">{header}</p>}
                <span className="absolute top-1.5 -left-[5px] size-2 rounded-full bg-musgo-2" aria-hidden />
                <p className="text-sm text-musgo-2">{fmtDate(it.at)}</p>
                {it.kind === "photo" && (
                  <img src={photoUrl(it.photo.id, "thumb")} alt="" loading="lazy" className="mt-1 w-full max-w-xs rounded-lg" />
                )}
                {it.kind === "event" && (
                  <p className={it.type.startsWith("bloom") ? "font-semibold text-labelo" : "font-semibold"}>
                    {EVENT_LABEL[it.type] ?? it.type}
                    {it.notes ? <span className="block font-normal">{it.notes}</span> : null}
                  </p>
                )}
                {it.kind === "reading" && (
                  <p>
                    Medição: {it.temperature != null && `${it.temperature} °C`}
                    {it.temperature != null && it.humidity != null && ", "}
                    {it.humidity != null && `${it.humidity}% de umidade`}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
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
    <form onSubmit={onSubmit} className="space-y-3 rounded-xl bg-etiqueta p-3">
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
        Salvar medição
      </Button>
    </form>
  );
}
