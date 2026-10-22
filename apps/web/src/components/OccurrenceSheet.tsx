import {
  COMFORT_DIMENSIONS,
  type ComfortDimension,
  type ComfortState,
  EVENT_LAYER,
  herbariumDate,
  type IsoDate,
  type OccurrenceCluster,
  toLocalDate,
} from "@orchidiary/shared";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { type Occurrence, type PlantComfort, type PlantLocation, photoUrl } from "../lib/api.ts";
import { EVENT_ICON, EVENT_LABEL, STAMPED, stampTone } from "../lib/events.ts";
import { LOCAL_TZ, typedDate } from "../lib/format.ts";
import { PhotoViewer } from "./PhotoViewer.tsx";
import { Icon, type IconName } from "./ui.tsx";

type Report = Extract<PlantComfort, { status: "ok" }>;

const OPEN_MS = 380;
const CLOSE_MS = 280;
const EASE = "cubic-bezier(0.2, 0.75, 0.25, 1)";
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const num = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const shortDate = (iso: IsoDate) => herbariumDate(iso, "UTC").replace(/\.\d{4}$/, "");
const hour = (at: string) => new Date(at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: LOCAL_TZ });
const dayOf = (at: string) => toLocalDate(new Date(at), LOCAL_TZ);
const keyOf = (o: Occurrence) => `${o.kind}:${o.id}`;

/** Período em que a planta estava num instante (o período cobre [validFrom, validTo)). */
function locationAt(locations: PlantLocation[], at: number) {
  return locations.find((l) => Date.parse(l.validFrom) <= at && (l.validTo === null || at < Date.parse(l.validTo))) ?? null;
}
const placeLabel = (l: PlantLocation | null) => (l ? (l.placeName ?? l.city ?? "localização própria") : null);

/** Ordem cronológica por dia; dentro do dia, as fotos primeiro e cada grupo pela hora. */
const feedOrder = (a: Occurrence, b: Occurrence) =>
  dayOf(a.at).localeCompare(dayOf(b.at)) || Number(b.kind === "photo") - Number(a.kind === "photo") || a.at.localeCompare(b.at);

const DIMENSION_SHORT: Record<ComfortDimension, string> = { night: "noite", day: "dia", humidity: "umidade" };
const STATE_TONE: Record<ComfortState, string> = { inside: "text-tinta", near: "text-ocre", outside: "text-ocre font-medium" };

/** O clima de um dia, a partir do relatório do gráfico (mesma janela). */
function climateOf(report: Report, date: IsoDate) {
  const dims = COMFORT_DIMENSIONS.flatMap((dimension) => {
    const d = report.dimensions.find((x) => x.dimension === dimension)?.days.find((x) => x.date === date);
    return d && d.value != null ? [{ dimension, value: d.value, state: d.state }] : [];
  });
  const rain = report.precipitation.find((p) => p.date === date)?.mm ?? null;
  return { dims, rain };
}

function ClimateLine({ report, date }: { report: Report; date: IsoDate }) {
  const { dims, rain } = climateOf(report, date);
  if (!dims.length) return <p className="typed text-[0.72rem]">sem clima registrado neste dia</p>;
  return (
    <p className="typed flex flex-wrap gap-x-2.5 gap-y-0.5 text-[0.72rem]">
      {dims.map((d) => (
        <span key={d.dimension}>
          {DIMENSION_SHORT[d.dimension]}{" "}
          <span className={d.state ? STATE_TONE[d.state] : "text-tinta"}>
            {num(d.value)}
            {d.dimension === "humidity" ? "%" : "°C"}
            {d.state === "outside" ? " · fora" : d.state === "near" ? " · perto" : ""}
          </span>
        </span>
      ))}
      <span>
        chuva <span className="text-tinta">{rain ? `${num(rain)} mm` : "—"}</span>
      </span>
    </p>
  );
}

/** Versão curta, para cada item quando o ponto junta dias diferentes. */
function shortClimate(report: Report, date: IsoDate) {
  const { dims } = climateOf(report, date);
  const v = (d: ComfortDimension) => dims.find((x) => x.dimension === d)?.value;
  const parts = [
    v("night") != null && `noite ${num(v("night")!)}`,
    v("day") != null && `dia ${num(v("day")!)}°C`,
    v("humidity") != null && `umid. ${num(v("humidity")!)}%`,
  ].filter(Boolean);
  return parts.join(" · ");
}

function iconOf(o: Extract<Occurrence, { kind: "event" }>): { name: IconName; tone: string } {
  if (EVENT_LAYER[o.type] === "health") return { name: "shield", tone: "text-ocre" };
  if (o.type === "bloom_start" || o.type === "bloom_end") return { name: "flower", tone: "text-orquidea" };
  if (o.type === "moved" || o.type === "repotting") return { name: EVENT_ICON[o.type] ?? "note", tone: "text-ocre" };
  return { name: EVENT_ICON[o.type] ?? "note", tone: "text-folhagem" };
}

interface Viewing {
  id: string;
  source: HTMLImageElement;
  caption: string | null;
  at: string;
}

/**
 * Folha expandida da fita: cresce do ponto tocado e ocupa a tela. No alto, o dia (ou o
 * intervalo, quando o ponto junta dias próximos) com o clima contra a faixa; depois o feed,
 * em ordem cronológica, com as fotos primeiro dentro de cada dia. As setas andam entre os pontos da fita; Esc fecha.
 */
export function OccurrenceSheet({
  plantName,
  report,
  locations,
  clusters,
  index,
  origin,
  onNavigate,
  onClose,
}: {
  plantName: string;
  report: Report;
  locations: PlantLocation[];
  clusters: OccurrenceCluster<Occurrence>[];
  index: number;
  /** Onde o dedo tocou (coordenadas da tela): a folha cresce dali */
  origin: { x: number; y: number };
  onNavigate: (index: number) => void;
  onClose: () => void;
}) {
  const sheet = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const [shown, setShown] = useState(false);
  const [viewing, setViewing] = useState<Viewing | null>(null);
  const closing = useRef(false);
  const cluster = clusters[index]!;

  const close = () => {
    if (closing.current) return;
    closing.current = true;
    setShown(false);
    window.setTimeout(onClose, reducedMotion() ? 150 : CLOSE_MS);
  };

  // abre no quadro seguinte, para a transição do clip-path partir do círculo fechado
  useLayoutEffect(() => {
    const frame = requestAnimationFrame(() => setShown(true));
    closeButton.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = previous;
    };
  }, []);

  // trocou de ponto: volta o feed para o topo
  useEffect(() => {
    body.current?.scrollTo({ top: 0 });
  }, [index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (viewing) return; // a foto ampliada cuida das próprias teclas
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft" && index > 0) onNavigate(index - 1);
      else if (e.key === "ArrowRight" && index < clusters.length - 1) onNavigate(index + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const reduced = reducedMotion();
  const clip = `circle(${shown ? "150%" : "0px"} at ${origin.x}px ${origin.y}px)`;
  const sheetStyle = reduced
    ? { opacity: shown ? 1 : 0, transition: "opacity 150ms ease" }
    : { clipPath: clip, transition: `clip-path ${shown ? OPEN_MS : CLOSE_MS}ms ${EASE}` };

  const days = cluster.days;
  const single = days.length === 1;
  const firstLoc = locationAt(locations, Date.parse(cluster.items[0]!.at));
  const lastLoc = locationAt(locations, Date.parse(cluster.items.at(-1)!.at));
  const indoor = firstLoc?.environment === "indoor" || lastLoc?.environment === "indoor";
  const place =
    single || placeLabel(firstLoc) === placeLabel(lastLoc)
      ? [placeLabel(firstLoc), firstLoc?.environment === "indoor" ? "dentro" : null].filter(Boolean).join(" · ")
      : `${placeLabel(firstLoc)} → ${placeLabel(lastLoc)}`;
  const readings = single ? report.readings.filter((r) => dayOf(r.measuredAt) === days[0]) : [];
  const feed = [...cluster.items].sort(feedOrder);
  const stamp = (o: Occurrence) => (single ? hour(o.at) : `${shortDate(dayOf(o.at))} · ${hour(o.at)}`);
  const title = single ? herbariumDate(days[0]!, "UTC") : `${shortDate(days[0]!)} – ${herbariumDate(days.at(-1)!, "UTC")}`;

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[24] bg-papel/70 backdrop-blur-[2px] transition-opacity duration-200"
        style={{ opacity: shown ? 1 : 0 }}
        onClick={close}
        aria-hidden="true"
      />
      <div
        ref={sheet}
        role="dialog"
        aria-modal="true"
        aria-label={`Ocorrências de ${title}`}
        className="fixed inset-0 z-[25] flex flex-col bg-papel pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
        style={sheetStyle}
      >
        <div className="flex items-center justify-between gap-2 border-b border-linha px-3.5 py-1.5">
          <button
            ref={closeButton}
            type="button"
            onClick={close}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-1.5 text-[0.86rem] active:bg-salvia-clara"
          >
            <Icon name="close" className="size-[18px]" />
            Fechar
          </button>
          <span className="typed text-[0.7rem] tabular-nums">
            ponto {index + 1} de {clusters.length}
            {cluster.items.length > 1 ? ` · ${cluster.items.length} ocorrências` : ""}
          </span>
        </div>

        <div ref={body} className="flex-1 overflow-y-auto overscroll-contain px-4 pt-4 pb-6">
          <section className="mx-auto flex max-w-[24rem] flex-col gap-3">
            <header className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-2 border-b-[1.5px] border-dotted border-contorno pb-1">
                <h3 className="font-serif text-[1.25rem]">{title}</h3>
                {place && <span className="typed text-right text-[0.68rem]">{place}</span>}
              </div>
              {single ? (
                <ClimateLine report={report} date={days[0]!} />
              ) : (
                <p className="typed text-[0.72rem]">{days.length} dias próximos · cada ocorrência com o clima do seu dia</p>
              )}
              {readings.length > 0 && (
                <p className="typed flex flex-wrap gap-x-2.5 text-[0.72rem]">
                  <span>medição</span>
                  {readings.map((r) => (
                    <span key={r.id} className="text-tinta">
                      {hour(r.measuredAt)}
                      {r.temperature != null && ` · ${num(r.temperature)}°C`}
                      {r.humidity != null && ` · ${num(r.humidity)}%`}
                    </span>
                  ))}
                </p>
              )}
              {indoor && <p className="font-mono text-[0.66rem] text-ocre">clima de fora, só referência</p>}
            </header>

            {feed.map((o, i) =>
              o.kind === "photo" ? (
                <figure key={keyOf(o)} className={`fixada m-0 border border-linha bg-folha p-2 pb-3 shadow-sm ${i % 2 ? "rotate-[0.6deg]" : ""}`}>
                  <button
                    type="button"
                    aria-label="Ampliar fotografia"
                    className="block w-full cursor-zoom-in"
                    onClick={(e) => {
                      const img = e.currentTarget.querySelector("img");
                      if (img) setViewing({ id: o.id, source: img, caption: o.caption, at: o.at });
                    }}
                  >
                    <img
                      src={photoUrl(o.id, "thumb")}
                      alt=""
                      loading="lazy"
                      width={o.width ?? undefined}
                      height={o.height ?? undefined}
                      className={`block h-auto w-full rounded-[2px] ${viewing?.id === o.id ? "invisible" : ""}`}
                    />
                  </button>
                  <figcaption className="mt-2 text-center text-[0.82rem] text-musgo">
                    {o.caption}
                    <span className="typed block text-[0.68rem]">
                      {stamp(o)}
                      {!single && shortClimate(report, dayOf(o.at)) ? ` · ${shortClimate(report, dayOf(o.at))}` : ""}
                    </span>
                  </figcaption>
                </figure>
              ) : o.kind === "event" ? (
                <div key={keyOf(o)} className="grid grid-cols-[1.6rem_minmax(0,1fr)] items-start gap-2">
                  <span className={`pt-0.5 ${iconOf(o).tone}`}>
                    <Icon name={iconOf(o).name} className="size-5" />
                  </span>
                  <div>
                    <p className="flex flex-wrap items-center gap-2 font-serif text-[1.08rem]">
                      {EVENT_LABEL[o.type] ?? o.type}
                      {STAMPED[o.type] && <span className={`selo ${stampTone(o.type)}`}>{STAMPED[o.type]}</span>}
                    </p>
                    {o.notes && <p className="mt-0.5 text-[0.85rem] text-musgo">{o.notes}</p>}
                    <p className="typed mt-0.5 text-[0.68rem]">
                      {stamp(o)}
                      {!single && shortClimate(report, dayOf(o.at)) ? ` · ${shortClimate(report, dayOf(o.at))}` : ""}
                    </p>
                  </div>
                </div>
              ) : null,
            )}
          </section>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-linha bg-folha px-3.5 py-1">
          <button
            type="button"
            disabled={index === 0}
            onClick={() => onNavigate(index - 1)}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-1.5 text-[0.86rem] active:bg-salvia-clara disabled:opacity-35"
          >
            <Icon name="arrow-right" className="size-[18px] rotate-180" />
            Anterior
          </button>
          <button
            type="button"
            disabled={index === clusters.length - 1}
            onClick={() => onNavigate(index + 1)}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-1.5 text-[0.86rem] active:bg-salvia-clara disabled:opacity-35"
          >
            Próxima
            <Icon name="arrow-right" className="size-[18px]" />
          </button>
        </div>
      </div>

      {viewing && (
        <PhotoViewer
          source={viewing.source}
          thumbSrc={photoUrl(viewing.id, "thumb")}
          fullSrc={photoUrl(viewing.id)}
          alt={`Fotografia de ${plantName}${viewing.caption ? `: ${viewing.caption}` : ""}, ${typedDate(viewing.at)}`}
          onClose={() => setViewing(null)}
        />
      )}
    </>,
    document.body,
  );
}
