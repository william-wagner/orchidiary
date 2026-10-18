import { formatLocality } from "@orchidiary/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router";
import { EventIcon } from "../components/EventIcon.tsx";
import { MovePrompt } from "../components/MovePrompt.tsx";
import { PhotoCapture } from "../components/PhotoCapture.tsx";
import { OriginFlag } from "../components/OriginFlag.tsx";
import { ancestorsLabel, PlantTaxon, plantOrigin } from "../components/Taxon.tsx";
import { TemperatureRegister } from "../components/TemperatureRegister.tsx";
import { Button, ErrorText, Field, Input, PressedOrchid } from "../components/ui.tsx";
import { api, illustrationUrl, type LocationCheck, type Photo, photoUrl, type Timeline } from "../lib/api.ts";
import { accession, coords, environmentLabel, monthHeading, typedDate } from "../lib/format.ts";

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

/** Linha do livro: gravura do tipo de registro à frente do texto */
const entry = "flex items-start gap-2";
const glyph = "mt-[3px] h-5 w-5 shrink-0";

const chip ="min-h-11 border border-sepia bg-transparent px-3 text-[1.02rem] active:bg-etiqueta";

/** Capa: a foto escolhida ou, na falta dela, a mais recente. */
function coverPhoto(t: Timeline | undefined): Photo | undefined {
  if (!t) return undefined;
  return (t.plant.coverPhotoId && t.photos.find((p) => p.id === t.plant.coverPhotoId)) || t.photos[0];
}

export function PlantDetail() {
  const { id } = useParams();
  // vindo do tombo: a planta foi salva, mas a foto de capa não subiu
  const photoError = (useLocation().state as { photoError?: string } | null)?.photoError;
  const qc = useQueryClient();
  const timeline = useQuery({
    queryKey: ["timeline", id],
    queryFn: () => api.get<Timeline>(`/plants/${id}/timeline`),
    // enquanto a prancha da capa está sendo desenhada, confere de tempos em tempos
    refetchInterval: (q) => (coverPhoto(q.state.data)?.illustrationStatus === "pending" ? 15_000 : false),
  });
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
  const cover = coverPhoto(timeline.data);
  const plate = cover?.illustrationStatus === "ready" && cover.illustrationUpdatedAt ? cover.illustrationUpdatedAt : null;

  return (
    <main className="pb-8">
      <div className="flex items-center justify-between px-4 pt-3">
        <Link to="/" className="inline-flex min-h-11 items-center">
          Voltar à coleção
        </Link>
        <Link to={`/plantas/${plant.id}/editar`} className="inline-flex min-h-11 items-center text-carimbo">
          Editar
        </Link>
      </div>

      {/* A exsicata: foto montada na folha e a etiqueta datilografada */}
      <section className="mx-4 flex flex-col gap-3 border border-linha bg-etiqueta p-3.5" aria-label="Exsicata">
        <div className={`mounted flex h-60 items-center justify-center ${plate ? "bg-prancha" : ""}`}>
          {cover && plate ? (
            // prancha inteira, sem corte: o fundo do container é o mesmo papel da ilustração
            <img src={illustrationUrl(cover.id, plate)} alt={`Prancha botânica de ${plant.nickname}`} className="h-full w-full object-contain" />
          ) : cover ? (
            <img src={photoUrl(cover.id)} alt={`Foto mais recente de ${plant.nickname}`} className="h-full w-full object-cover" />
          ) : (
            <PressedOrchid className="h-40 w-24" />
          )}
        </div>
        <div className="herb-label px-3 py-2.5">
          <div className="mb-1.5 flex justify-between border-b border-sepia pb-1 text-[0.9rem]">
            <span>Herbário Orchidiary</span>
            <span>{accession(plant.accessionNumber)}</span>
          </div>
          {plant.taxon && plant.taxon.lineage.length > 1 && (
            <p className="typed text-[0.78rem]">{ancestorsLabel(plant.taxon.lineage)}</p>
          )}
          <h1 className="text-[1.6rem] leading-tight">
            <PlantTaxon plant={plant} /> <OriginFlag origin={plantOrigin(plant)} />
          </h1>
          <p className="text-lg">{plant.nickname}</p>
          <div className="typed mt-1 text-[0.8rem] leading-relaxed">
            {current && (
              <>
                <p>
                  {current.placeName ? `${current.placeName}, ` : ""}
                  {environmentLabel(current.environment)}
                </p>
                {formatLocality(current) && <p>{formatLocality(current)}</p>}
                <p className="text-pontilhado">{coords(current)}</p>
              </>
            )}
            {first && <p>Na coleção desde {typedDate(plant.acquiredAt ?? first.validFrom)}</p>}
            {locations.length > 1 && <p>Já passou por {locations.length} lugares</p>}
          </div>
          {plant.taxon && (
            <Link to={`/guia/${plant.taxon.id}`} className="inline-flex min-h-11 items-center text-carimbo">
              Ver ficha de cultivo
            </Link>
          )}
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
        {photoError && !cover && (
          <p className="text-alerta">A planta foi tombada, mas a foto de capa não foi enviada ({photoError}). Tente de novo abaixo.</p>
        )}
        <div className="flex flex-wrap gap-2">
          <PhotoCapture
            plantId={plant.id}
            className="min-h-11 border border-sepia bg-sepia px-3 text-[1.02rem] text-papel active:opacity-85"
            onSaved={({ photo, locationCheck }) => {
              refresh();
              if (locationCheck?.mismatch) setPendingMove({ check: locationCheck, takenAt: photo.takenAt });
            }}
          />
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
                        <p className={entry}>
                          <EventIcon type="photo" className={glyph} />
                          <span>Fotografia{it.photo.caption ? `: ${it.photo.caption}` : ""}</span>
                        </p>
                        <img
                          src={photoUrl(it.photo.id, "thumb")}
                          alt=""
                          loading="lazy"
                          className="mt-1.5 ml-7 w-full max-w-[14rem] border border-linha"
                        />
                      </>
                    )}
                    {it.kind === "event" && (
                      <p className={entry}>
                        <EventIcon type={it.type} className={glyph} />
                        <span>
                          {EVENT_LABEL[it.type] ?? it.type}
                          {it.notes && <span className="block text-pontilhado">{it.notes}</span>}
                        </span>
                      </p>
                    )}
                    {it.kind === "reading" && (
                      <p className={entry}>
                        <EventIcon type="reading" className={glyph} />
                        <span>
                          Medição:{" "}
                          <span className="typed text-[0.9rem]">
                            {[
                              it.temperature != null ? `${it.temperature} °C` : null,
                              it.humidity != null ? `${it.humidity}%` : null,
                            ]
                              .filter(Boolean)
                              .join(", ")}
                          </span>
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
