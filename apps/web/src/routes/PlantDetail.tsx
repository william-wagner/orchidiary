import { formatLocality, joinsBatch } from "@orchidiary/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, Fragment, type ReactNode, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router";
import { ClimatePanel } from "../components/ClimatePanel.tsx";
import { CoverSheet } from "../components/CoverSheet.tsx";
import { MovePrompt } from "../components/MovePrompt.tsx";
import { PhotoCapture } from "../components/PhotoCapture.tsx";
import { PhotoViewer } from "../components/PhotoViewer.tsx";
import { OriginFlag } from "../components/OriginFlag.tsx";
import { type BatchAction, PlaceBatchSheet } from "../components/PlaceBatchSheet.tsx";
import { ancestorsLabel, PlantTaxon, plantOrigin } from "../components/Taxon.tsx";
import { TemperatureRegister } from "../components/TemperatureRegister.tsx";
import { useToast } from "../components/Toast.tsx";
import { BackLink, Button, ErrorText, Field, Icon, type IconName, Input, PressedOrchid } from "../components/ui.tsx";
import {
  api,
  type CollectionPlant,
  illustrationUrl,
  type LocationCheck,
  type Photo,
  photoUrl,
  type PlantLocation,
  type Timeline,
} from "../lib/api.ts";
import { coverOf } from "../lib/cover.ts";
import { EVENT_ICON, EVENT_LABEL, STAMPED, stampTone } from "../lib/events.ts";
import { accession, coords, environmentLabel, monthHeading, typedDate } from "../lib/format.ts";

const QUICK_EVENTS = ["watering", "fertilizing", "bloom_start", "new_growth"] as const;

/** Depois destes, o toast oferece o mesmo registro para as outras plantas do lugar */
const BATCH_SHORTCUT: Partial<Record<string, BatchAction>> = { watering: "watering", fertilizing: "fertilizing" };

type Item =
  | { kind: "photo"; at: string; photo: Photo }
  | {
      kind: "event";
      at: string;
      id: string;
      type: string;
      notes: string | null;
      /** Registro em lote: tamanho e o lugar onde a planta estava na data */
      batch: { size: number; placeName: string | null } | null;
    }
  | { kind: "reading"; at: string; id: string; temperature: number | null; humidity: number | null; placeName: string | null };

/** Lugar onde a planta estava num instante (o período cobre [validFrom, validTo)). */
function placeNameAt(locations: PlantLocation[], at: string) {
  const t = Date.parse(at);
  const loc = locations.find((l) => Date.parse(l.validFrom) <= t && (l.validTo === null || t < Date.parse(l.validTo)));
  return loc?.placeName ?? null;
}

const chip =
  "inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-linha bg-folha px-3 text-[0.85rem] text-folhagem active:bg-salvia-clara disabled:opacity-45";

function itemIcon(it: Item): IconName {
  if (it.kind === "photo") return "camera";
  if (it.kind === "reading") return "thermometer";
  return EVENT_ICON[it.type] ?? "note";
}

/** Capa: a foto escolhida ou, na falta dela, a primeira (a timeline vem da mais recente para a mais antiga). */
function coverPhoto(t: Timeline | undefined): Photo | undefined {
  return t && coverOf(t.plant, t.photos);
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
  // a coleção (já em cache) diz quem mais está no mesmo lugar, para o atalho do lote
  const collection = useQuery({ queryKey: ["plants"], queryFn: () => api.get<CollectionPlant[]>("/plants") });
  const toast = useToast();
  const [pendingMove, setPendingMove] = useState<{ check: LocationCheck; takenAt: string } | null>(null);
  const [showReading, setShowReading] = useState(false);
  const [changingCover, setChangingCover] = useState(false);
  const [batch, setBatch] = useState<{ place: { id: string; name: string }; action: BatchAction } | null>(null);
  /** Foto ampliada: a capa ("capa") ou uma foto do livro (o id dela) */
  const [viewing, setViewing] = useState<{
    id: string;
    source: HTMLImageElement;
    thumbSrc: string;
    fullSrc: string;
    alt: string;
    fit: "contain" | "cover";
  } | null>(null);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["timeline", id] });
    qc.invalidateQueries({ queryKey: ["plants"] });
    qc.invalidateQueries({ queryKey: ["comfort", id] });
    qc.invalidateQueries({ queryKey: ["occurrences", id] });
  };

  const current = timeline.data?.locations.find((l) => l.validTo === null);
  const neighbors = (collection.data ?? []).filter((p) => current?.placeId && p.currentLocation?.placeId === current.placeId);

  const addEvent = useMutation({
    mutationFn: (type: string) => api.post(`/plants/${id}/events`, { type }),
    onSuccess: (_, type) => {
      refresh();
      const action = BATCH_SHORTCUT[type];
      const others = neighbors.filter((p) => p.id !== id && joinsBatch(p.status)).length;
      if (!action || !current?.placeId || !current.placeName || others === 0) return;
      const place = { id: current.placeId, name: current.placeName };
      toast({
        message: `${EVENT_LABEL[type]} registrada. Fazer o mesmo ${others === 1 ? "na outra planta" : `nas outras ${others} plantas`} de ${place.name}?`,
        duration: 9000,
        actions: [{ label: "Ver lote", run: () => setBatch({ place, action }) }],
      });
    },
  });

  const items = useMemo<Item[]>(() => {
    const t = timeline.data;
    if (!t) return [];
    return [
      ...t.photos.map((p): Item => ({ kind: "photo", at: p.takenAt, photo: p })),
      ...t.events.map(
        (e): Item => ({
          kind: "event",
          at: e.occurredAt,
          id: e.id,
          type: e.type,
          notes: e.notes,
          batch: e.batchId ? { size: e.batchSize ?? 1, placeName: placeNameAt(t.locations, e.occurredAt) } : null,
        }),
      ),
      ...t.readings.map(
        (r): Item => ({
          kind: "reading",
          at: r.measuredAt,
          id: r.id,
          temperature: r.temperature,
          humidity: r.humidity,
          placeName: r.placeId ? (r.placeName ?? "lugar sem nome") : null,
        }),
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
  const first = locations[0];
  const cover = coverPhoto(timeline.data);
  const plate = cover?.illustrationStatus === "ready" && cover.illustrationUpdatedAt ? cover.illustrationUpdatedAt : null;

  return (
    <main className="px-5 pt-3 pb-8">
      <div className="flex items-center justify-between">
        <Link to="/">
          <BackLink>Voltar à coleção</BackLink>
        </Link>
        <Link to={`/plantas/${plant.id}/editar`} className="inline-flex min-h-11 items-center text-[0.9rem] text-orquidea">
          Editar
        </Link>
      </div>

      <header className="mt-2 mb-5">
        <p className="eyebrow">{accession(plant.accessionNumber)}</p>
        <h1 className="mt-1.5 text-[2.35rem] leading-[1.08] tracking-[-0.03em] [overflow-wrap:anywhere]">
          <PlantTaxon plant={plant} /> <OriginFlag origin={plantOrigin(plant)} />
        </h1>
        <p className="mt-1.5 font-serif text-[1.15rem] text-folhagem italic">{plant.nickname}</p>
      </header>

      {/* A exsicata: a prancha presa na página e a etiqueta com os dados */}
      <section className="overflow-hidden rounded-xl border border-linha bg-folha shadow-caderno sm:grid sm:grid-cols-2" aria-label="Exsicata">
        <div className={`fixada flex h-72 items-center justify-center p-5 ${plate ? "bg-prancha" : "bg-salvia-clara/60"}`}>
          {cover ? (
            <button
              type="button"
              aria-label={plate ? "Ampliar prancha botânica" : "Ampliar foto de capa"}
              className="block h-full w-full cursor-zoom-in"
              onClick={(e) => {
                const img = e.currentTarget.querySelector("img");
                const src = plate ? illustrationUrl(cover.id, plate) : photoUrl(cover.id);
                if (img) setViewing({ id: "capa", source: img, thumbSrc: src, fullSrc: src, alt: img.alt, fit: plate ? "contain" : "cover" });
              }}
            >
              {plate ? (
                // prancha inteira, sem corte: o fundo do container é o mesmo papel da ilustração
                <img
                  src={illustrationUrl(cover.id, plate)}
                  alt={`Prancha botânica de ${plant.nickname}`}
                  className={`h-full w-full object-contain ${viewing?.id === "capa" ? "invisible" : ""}`}
                />
              ) : (
                <img
                  src={photoUrl(cover.id)}
                  alt={`Foto mais recente de ${plant.nickname}`}
                  className={`h-full w-full rounded-sm object-cover ${viewing?.id === "capa" ? "invisible" : ""}`}
                />
              )}
            </button>
          ) : (
            <PressedOrchid className="h-40 w-24" />
          )}
          {cover?.illustrationStatus === "pending" && !plate && (
            <span className="selo selo-ocre absolute bottom-3 left-3 z-[2]">Desenhando a prancha…</span>
          )}
          <button
            type="button"
            onClick={() => setChangingCover(true)}
            className="absolute right-3 bottom-3 z-[2] inline-flex min-h-11 items-center gap-2 rounded-full border border-contorno bg-folha px-3.5 text-[0.85rem] font-medium text-tinta shadow-sm active:bg-salvia-clara"
          >
            <Icon name="image" className="size-4" />
            Trocar capa
          </button>
        </div>
        <div className="border-t border-linha px-5 py-5 sm:border-t-0 sm:border-l">
          <div className="typed mb-3 flex justify-between gap-2 border-b border-contorno pb-2.5 text-[0.68rem] tracking-[0.06em] uppercase">
            <span>Herbário Orchidiary</span>
            <span>{accession(plant.accessionNumber)}</span>
          </div>
          {plant.taxon && plant.taxon.lineage.length > 1 && (
            <p className="typed text-[0.7rem] leading-relaxed">{ancestorsLabel(plant.taxon.lineage)}</p>
          )}
          <p className="mt-1 font-serif text-[1.5rem] leading-tight">
            <PlantTaxon plant={plant} />
          </p>
          <ul className="mt-4 grid gap-2 text-[0.88rem]">
            {current && (
              <DataRow icon="pin">
                {current.placeName ? `${current.placeName}, ` : ""}
                {environmentLabel(current.environment)}
                {formatLocality(current) && <span className="block">{formatLocality(current)}</span>}
                <span className="typed block text-[0.75rem] text-musgo">{coords(current)}</span>
              </DataRow>
            )}
            {first && <DataRow icon="sprout">Na coleção desde {typedDate(plant.acquiredAt ?? first.validFrom)}</DataRow>}
            {locations.length > 1 && <DataRow icon="arrow-right">Já passou por {locations.length} lugares</DataRow>}
          </ul>
          {plant.taxon && (
            <Link to={`/guia/${plant.taxon.id}`} className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-[0.9rem] text-orquidea">
              Ver ficha de cultivo
              <Icon name="arrow-right" className="size-4" />
            </Link>
          )}
        </div>
      </section>

      <section className="cartao mt-5 px-4 py-4" aria-label="Registro térmico">
        <TemperatureRegister days={weather.slice(-30)} />
        {current?.environment === "indoor" && (
          <p className="mt-2.5 text-[0.82rem] text-musgo">
            Clima de fora, como referência. Dentro de casa vale o que você medir.
          </p>
        )}
      </section>

      <ClimatePanel plantId={plant.id} plantName={plant.nickname} locations={locations} />

      <section className="mt-6 space-y-3" aria-label="Registrar">
        {photoError && !cover && (
          <p className="text-[0.9rem] text-alerta">A planta foi tombada, mas a foto de capa não foi enviada ({photoError}). Tente de novo abaixo.</p>
        )}
        <div className="flex flex-wrap gap-2">
          <PhotoCapture
            plantId={plant.id}
            className="min-h-11 rounded-lg bg-tinta px-3 text-[0.85rem] text-folha active:bg-tinta-viva"
            onSaved={({ photo, locationCheck }) => {
              refresh();
              if (locationCheck?.mismatch) setPendingMove({ check: locationCheck, takenAt: photo.takenAt });
            }}
          />
          {QUICK_EVENTS.map((t) => (
            <button key={t} onClick={() => addEvent.mutate(t)} disabled={addEvent.isPending} className={chip}>
              <Icon name={EVENT_ICON[t] ?? "note"} className="size-4" />
              {EVENT_LABEL[t]}
            </button>
          ))}
          <button onClick={() => setShowReading((v) => !v)} className={chip} aria-expanded={showReading}>
            <Icon name="thermometer" className="size-4" />
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

      <section className="mt-9" aria-label="Livro de registro">
        <h2 className="border-b border-linha pb-3 text-[1.75rem] tracking-[-0.02em]">Livro de registro</h2>
        {items.length === 0 && (
          <p className="mt-4 rounded-lg bg-salvia-clara/70 px-4 py-4 text-[0.9rem] text-musgo">
            Nenhum registro ainda. Fotografe a planta para abrir o livro dela.
          </p>
        )}
        {groups.map((g) => (
          <div key={g.month}>
            <h3 className="mt-6 mb-4 font-serif text-[1.05rem] text-musgo italic first-letter:uppercase">{g.month}</h3>
            <ol>
              {g.items.map((it, i) => (
                <Fragment key={`${it.kind}-${it.kind === "photo" ? it.photo.id : it.id}`}>
                {/* separador entre um dia e o seguinte (mesma data de etiqueta que aparece na linha) */}
                {i > 0 && typedDate(g.items[i - 1]?.at ?? it.at) !== typedDate(it.at) && (
                  <li role="separator" className="mb-5 border-t-[1.5px] border-dotted border-contorno" />
                )}
                <li className="group grid grid-cols-[4.6rem_1.25rem_minmax(0,1fr)] gap-x-2">
                  <span className="typed pt-1 text-[0.68rem]">{typedDate(it.at)}</span>
                  <span className="relative flex justify-center pt-0.5 text-folhagem">
                    <Icon name={itemIcon(it)} className="size-4" />
                    <span className="absolute top-6 -bottom-1 w-px bg-linha group-last:hidden" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 pb-6 pl-1">
                    {it.kind === "photo" && (
                      <>
                        <p className="font-serif text-[1.1rem]">Fotografia{it.photo.caption ? `: ${it.photo.caption}` : ""}</p>
                        <div className="fixada mt-3 max-w-[15rem] -rotate-1 border border-linha bg-folha p-2 pb-3 shadow-sm">
                          <button
                            type="button"
                            aria-label="Ampliar fotografia"
                            className="block w-full cursor-zoom-in"
                            onClick={(e) => {
                              const img = e.currentTarget.querySelector("img");
                              const { id: photoId, caption, takenAt } = it.photo;
                              if (img)
                                setViewing({
                                  id: photoId,
                                  source: img,
                                  thumbSrc: photoUrl(photoId, "thumb"),
                                  fullSrc: photoUrl(photoId),
                                  alt: `Fotografia de ${plant.nickname}${caption ? `: ${caption}` : ""}, ${typedDate(takenAt)}`,
                                  fit: "contain",
                                });
                            }}
                          >
                            {/* enquanto ampliada, a foto "sai" do porta-retrato e só a moldura fica na página */}
                            <img
                              src={photoUrl(it.photo.id, "thumb")}
                              alt=""
                              loading="lazy"
                              className={`w-full ${viewing?.id === it.photo.id ? "invisible" : ""}`}
                            />
                          </button>
                        </div>
                      </>
                    )}
                    {it.kind === "event" && (
                      <div>
                        <p className="flex flex-wrap items-center gap-2 font-serif text-[1.1rem]">
                          {EVENT_LABEL[it.type] ?? it.type}
                          {STAMPED[it.type] && <span className={`selo ${stampTone(it.type)}`}>{STAMPED[it.type]}</span>}
                        </p>
                        {it.notes && <p className="mt-1 text-[0.85rem] leading-relaxed text-musgo">{it.notes}</p>}
                        {it.batch && (
                          <p className="typed mt-1 flex items-center gap-1.5 text-[0.7rem]">
                            <Icon name="layers" className="size-3.5" />
                            {it.batch.size > 1
                              ? `com outras ${it.batch.size - 1 === 1 ? "planta" : `${it.batch.size - 1} plantas`}`
                              : "registro em lote"}
                            {it.batch.placeName ? ` · ${it.batch.placeName}` : ""}
                          </p>
                        )}
                      </div>
                    )}
                    {it.kind === "reading" && (
                      <div>
                        <p className="font-serif text-[1.1rem]">
                          Medição:{" "}
                          <span className="typed text-[0.85rem]">
                            {[
                              it.temperature != null ? `${it.temperature} °C` : null,
                              it.humidity != null ? `${it.humidity}%` : null,
                            ]
                              .filter(Boolean)
                              .join(", ")}
                          </span>
                        </p>
                        {it.placeName && (
                          <p className="typed mt-1 flex items-center gap-1.5 text-[0.7rem]">
                            <Icon name="pin" className="size-3.5" />
                            medição do local · {it.placeName}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </li>
                </Fragment>
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

      {viewing && (
        <PhotoViewer
          source={viewing.source}
          thumbSrc={viewing.thumbSrc}
          fullSrc={viewing.fullSrc}
          alt={viewing.alt}
          fit={viewing.fit}
          onClose={() => setViewing(null)}
        />
      )}

      {changingCover && (
        <CoverSheet
          plant={plant}
          photos={timeline.data.photos}
          onClose={() => setChangingCover(false)}
          onUploaded={({ photo, locationCheck }) => {
            if (locationCheck?.mismatch) setPendingMove({ check: locationCheck, takenAt: photo.takenAt });
          }}
        />
      )}

      {batch && (
        <PlaceBatchSheet
          place={batch.place}
          plants={neighbors}
          initialAction={batch.action}
          onClose={() => setBatch(null)}
        />
      )}
    </main>
  );
}

function DataRow({ icon, children }: { icon: IconName; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-folhagem">
      <Icon name={icon} className="mt-0.5 size-4 text-musgo" />
      <span>{children}</span>
    </li>
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
    <form onSubmit={onSubmit} className="cartao space-y-3 p-4">
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
