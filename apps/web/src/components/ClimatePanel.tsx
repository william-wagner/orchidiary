import {
  addDays,
  CHART_DEFAULT_WINDOW,
  CHART_WINDOW_OPTIONS,
  type ChartWindow,
  classifyComfort,
  clusterOccurrences,
  COMFORT_LABEL,
  COMFORT_MARGIN,
  type ComfortDimension,
  type ComfortState,
  DEFAULT_OCCURRENCE_LAYERS,
  daysBetween,
  EVENT_LAYER,
  CROSS_SIDE_LABEL,
  herbariumDate,
  type IsoDate,
  isWeeklyChart,
  OCCURRENCE_LAYER_LABEL,
  OCCURRENCE_LAYERS,
  type OccurrenceCluster,
  type OccurrenceLayer,
  parseChartWindow,
  startOfLocalDay,
  toLocalDate,
  weeklySeries,
  weekStart,
} from "@orchidiary/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { api, type ComfortDimensionReport, type Occurrence, type PlantComfort, type PlantLocation, type WeatherDay } from "../lib/api.ts";
import { EVENT_LABEL } from "../lib/events.ts";
import { LOCAL_TZ } from "../lib/format.ts";
import { useWidth } from "../lib/useWidth.ts";
import { ClimateSummary } from "./ClimateSummary.tsx";
import { TemperatureRegister } from "./TemperatureRegister.tsx";
import { OccurrenceSheet } from "./OccurrenceSheet.tsx";
import { Icon } from "./ui.tsx";

type Report = Extract<PlantComfort, { status: "ok" }>;
type Origin = { x: number; y: number };
/** Ponto aberto na folha: a primeira ocorrência dele e onde o dedo tocou */
type Selection = { key: string; origin: Origin };

// ─── Preferências lembradas no aparelho (valem para todas as plantas) ────────

const OPEN_KEY = "orchidiary:clima-aberto";
const WINDOW_KEY = "orchidiary:grafico-janela";
const VIEW_KEY = "orchidiary:grafico-camadas";

function readPref<T>(key: string, parse: (raw: string | null) => T): T {
  try {
    return parse(localStorage.getItem(key));
  } catch {
    return parse(null);
  }
}

function savePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // sem armazenamento (aba anônima): só não lembra
  }
}

/** O que aparece no gráfico: a fita (e quais camadas dela), a chuva e as medições */
interface View {
  events: boolean;
  layers: OccurrenceLayer[];
  rain: boolean;
  readings: boolean;
}

const DEFAULT_VIEW: View = { events: true, layers: [...DEFAULT_OCCURRENCE_LAYERS], rain: false, readings: true };

function parseView(raw: string | null): View {
  if (!raw) return DEFAULT_VIEW;
  try {
    const v = JSON.parse(raw) as Partial<View>;
    return {
      events: typeof v.events === "boolean" ? v.events : DEFAULT_VIEW.events,
      layers: Array.isArray(v.layers) ? OCCURRENCE_LAYERS.filter((l) => v.layers!.includes(l)) : DEFAULT_VIEW.layers,
      rain: typeof v.rain === "boolean" ? v.rain : DEFAULT_VIEW.rain,
      readings: typeof v.readings === "boolean" ? v.readings : DEFAULT_VIEW.readings,
    };
  } catch {
    return DEFAULT_VIEW;
  }
}

// ─── Formatação ──────────────────────────────────────────────────────────────

const num = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
/** 16.X (sem o ano) */
const shortDate = (iso: IsoDate) => herbariumDate(iso, "UTC").replace(/\.\d{4}$/, "");
/** VIII (só o mês, para as marcas do eixo) */
const romanMonth = (iso: IsoDate) => herbariumDate(iso, "UTC").split(".")[1]!;
const unitOf = (d: ComfortDimension) => (d === "humidity" ? "%" : "°C");
const DIMENSION_NAME: Record<ComfortDimension, string> = { night: "noites", day: "dias", humidity: "umidade" };
const WINDOW_LABEL = (w: ChartWindow) => (w === "all" ? "tudo" : `${w} d`);

const dayOf = (o: Occurrence) => toLocalDate(new Date(o.at), LOCAL_TZ);
const layerOf = (o: Occurrence): OccurrenceLayer | null =>
  o.kind === "photo" ? "photos" : o.kind === "event" ? EVENT_LAYER[o.type] : null;
const occurrenceKey = (o: Occurrence) => `${o.kind}:${o.id}`;
const occurrenceLabel = (o: Occurrence) => (o.kind === "photo" ? "Fotografia" : o.kind === "event" ? (EVENT_LABEL[o.type] ?? o.type) : "Medição");

/**
 * Seção "Clima e ocorrências" da ficha: noites, dias e umidade em três painéis num eixo
 * de tempo só, a faixa da ficha ao fundo, e a fita do que aconteceu com a planta embaixo.
 * Janela, camadas e aberto/fechado ficam lembrados no aparelho.
 */
export function ClimatePanel({
  plantId,
  plantName,
  locations,
  weather,
}: {
  plantId: string;
  plantName: string;
  locations: PlantLocation[];
  weather: WeatherDay[];
}) {
  const [open, setOpen] = useState(() => readPref(OPEN_KEY, (r) => r === "1"));
  const [window, setWindow] = useState<ChartWindow>(() => readPref(WINDOW_KEY, (r) => parseChartWindow(r) ?? CHART_DEFAULT_WINDOW));
  const [view, setView] = useState<View>(() => readPref(VIEW_KEY, parseView));
  const [selected, setSelected] = useState<Selection | null>(null);

  const comfort = useQuery({
    queryKey: ["comfort", plantId, window],
    queryFn: () => api.get<PlantComfort>(`/plants/${plantId}/comfort?days=${window}`),
    placeholderData: keepPreviousData,
  });
  const c = comfort.data;
  const range = c?.status === "ok" ? { from: c.from, to: c.to } : null;
  const occurrences = useQuery({
    queryKey: ["occurrences", plantId, range?.from, range?.to],
    queryFn: () => api.get<{ items: Occurrence[] }>(`/plants/${plantId}/occurrences?from=${range!.from}&to=${range!.to}`),
    // fechada, a seção só mostra o clima: a fita de ocorrências não é buscada
    enabled: !!range && open,
    placeholderData: keepPreviousData,
  });

  if (!c || c.status === "no_location") return null;

  if (c.status === "no_ranges") {
    return (
      <section className="cartao mt-5 px-4 py-4" aria-label="Clima e ocorrências">
        <TemperatureRegister days={weather.slice(-COMPACT_DAYS)} />
        <p className="mt-3 border-t border-dotted border-contorno pt-2.5 text-[0.82rem] text-musgo">
          A ficha de cultivo desta planta não tem faixas de temperatura nem de umidade para comparar com o clima.
        </p>
      </section>
    );
  }

  const toggle = () => {
    setOpen(!open);
    savePref(OPEN_KEY, open ? "0" : "1");
  };
  const chooseWindow = (w: ChartWindow) => {
    setWindow(w);
    setSelected(null);
    savePref(WINDOW_KEY, String(w));
  };
  const changeView = (next: View) => {
    setView(next);
    setSelected(null);
    savePref(VIEW_KEY, JSON.stringify(next));
  };

  // o que o selo do card mostra (últimos 7 dias, sem os silenciados), para o resumo da seção fechada
  const problems = c.dimensions.filter((d) => d.attention.direction && !d.silenced);
  const items = occurrences.data?.items ?? [];
  // fechada, o resumo cobre os últimos 30 dias, qualquer que seja a janela escolhida
  const compactFrom = c.dimensions[0]?.days.at(-COMPACT_DAYS)?.date ?? c.from;

  return (
    <section className="cartao mt-5 px-4 py-4" aria-label="Clima e ocorrências">
      <h2>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={`clima-${plantId}`}
          className="flex w-full flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-left"
        >
          <span className="flex items-center gap-1.5 font-serif text-[1.3rem] whitespace-nowrap">
            <Icon name="chevron" className={`size-4 self-center transition-transform ${open ? "rotate-90" : ""}`} />
            Clima e ocorrências
          </span>
          <span className="typed text-[0.62rem] whitespace-nowrap">
            {open ? `${shortDate(c.from)} – ${herbariumDate(c.to, "UTC")}` : `Últimos ${COMPACT_DAYS} dias · ${shortDate(compactFrom)}–${shortDate(c.to)}`}
          </span>
        </button>
      </h2>

      {!open ? (
        <div id={`clima-${plantId}`}>
          <ClimateSummary report={c} weather={weather} />
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[0.8rem] text-musgo">
          {problems.length ? (
            problems.map((d) => (
              <span key={d.dimension} className="selo selo-ocre">
                {COMFORT_LABEL[d.dimension][d.attention.direction as -1 | 1]} · {d.attention.count} de {d.attention.total} dias
              </span>
            ))
          ) : (
            <span>Tudo dentro da faixa na última semana.</span>
          )}
          {c.environment === "indoor" && <span>Clima de fora, só referência.</span>}
          </div>
        </div>
      ) : (
        <div id={`clima-${plantId}`}>
          <p className="mt-1 text-[0.82rem] text-musgo">
            {c.placeName ? `${c.placeName} · ` : ""}clima diário de onde a planta estava, contra a faixa da ficha
          </p>
          {c.environment === "indoor" && (
            <p className="mt-2.5 rounded-lg border border-dashed border-ocre bg-ocre-claro/60 px-3 py-2 text-[0.8rem] text-ocre">
              A planta está dentro de casa, e o clima comparado é o de fora: use só como referência. Dentro de casa vale o que você
              medir.
            </p>
          )}

          <Controls window={window} onWindow={chooseWindow} view={view} onView={changeView} />

          <div className={`mt-3 transition-opacity ${comfort.isPlaceholderData ? "opacity-60" : ""}`}>
            <Pauta
              plantName={plantName}
              report={c}
              locations={locations}
              items={items}
              view={view}
              selected={selected}
              onSelect={setSelected}
            />
            <Legend view={view} />
            <Counts report={c} />
            <InheritedNote report={c} />
          </div>
        </div>
      )}
    </section>
  );
}

/** Dias do resumo da seção fechada e do Registro térmico */
const COMPACT_DAYS = 30;

// ─── Controles ───────────────────────────────────────────────────────────────

const chipBase = "min-h-8 rounded-full border px-2.5 font-mono text-[0.72rem] leading-snug transition-colors disabled:opacity-40";
/** Escolha exclusiva (janela) ou interruptor geral: tinta cheia quando ligado */
const chipStrong = (on: boolean) => `${chipBase} ${on ? "border-tinta bg-tinta text-folha" : "border-contorno text-musgo active:bg-salvia-clara"}`;
/** Camadas: sálvia quando ligadas */
const chipSoft = (on: boolean) => `${chipBase} ${on ? "border-contorno bg-salvia text-tinta" : "border-contorno text-musgo active:bg-salvia-clara"}`;

function ChipRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={label}>
      <span className="eyebrow w-[4.6rem] shrink-0" aria-hidden="true">
        {label}
      </span>
      {children}
    </div>
  );
}

function Controls({
  window,
  onWindow,
  view,
  onView,
}: {
  window: ChartWindow;
  onWindow: (w: ChartWindow) => void;
  view: View;
  onView: (v: View) => void;
}) {
  const toggleLayer = (layer: OccurrenceLayer) =>
    onView({ ...view, layers: view.layers.includes(layer) ? view.layers.filter((l) => l !== layer) : OCCURRENCE_LAYERS.filter((l) => l === layer || view.layers.includes(l)) });
  return (
    <div className="mt-3 flex flex-col gap-1.5 border-y border-linha py-2.5">
      <ChipRow label="Janela">
        {CHART_WINDOW_OPTIONS.map((w) => (
          <button key={w} type="button" aria-pressed={window === w} onClick={() => onWindow(w)} className={chipStrong(window === w)}>
            {WINDOW_LABEL(w)}
          </button>
        ))}
      </ChipRow>
      <ChipRow label="Ocorrên.">
        <button type="button" aria-pressed={view.events} onClick={() => onView({ ...view, events: !view.events })} className={chipStrong(view.events)}>
          mostrar
        </button>
        {OCCURRENCE_LAYERS.map((l) => (
          <button
            key={l}
            type="button"
            disabled={!view.events}
            aria-pressed={view.layers.includes(l)}
            onClick={() => toggleLayer(l)}
            className={chipSoft(view.layers.includes(l))}
          >
            {OCCURRENCE_LAYER_LABEL[l].toLowerCase()}
          </button>
        ))}
      </ChipRow>
      <ChipRow label="Camada">
        <button type="button" aria-pressed={view.rain} onClick={() => onView({ ...view, rain: !view.rain })} className={chipSoft(view.rain)}>
          chuva
        </button>
        <button type="button" aria-pressed={view.readings} onClick={() => onView({ ...view, readings: !view.readings })} className={chipSoft(view.readings)}>
          medições
        </button>
      </ChipRow>
    </div>
  );
}

// ─── O gráfico ───────────────────────────────────────────────────────────────

// geometria (px): margem esquerda para os números da faixa, altura de cada painel e o vão entre eles
const L = 38;
const R = 10;
const TOP = 14;
const PANEL_H = 54;
const PANEL_GAP = 20;
/** Marcas do eixo mais próximas que isso são puladas */
const TICK_MIN_GAP = 26;
const mono = "var(--font-mono)";

interface SeriesPoint {
  date: IsoDate;
  value: number | null;
  state: ComfortState | null;
}

const WEATHER_KEY = { night: "tempMin", day: "tempMax", humidity: "humidityMean" } as const;

/** Linha de cada dimensão: dia a dia, ou por semana acima de 120 dias (as contas seguem por dia). */
function seriesOf(report: Report, weekly: boolean): Map<ComfortDimension, SeriesPoint[]> {
  const out = new Map<ComfortDimension, SeriesPoint[]>();
  if (!weekly) {
    for (const d of report.dimensions) out.set(d.dimension, d.days.map(({ date, value, state }) => ({ date, value, state })));
    return out;
  }
  const byDate = new Map<IsoDate, { date: IsoDate; tempMin: number | null; tempMax: number | null; humidityMean: number | null }>();
  for (const d of report.dimensions) {
    for (const day of d.days) {
      const row = byDate.get(day.date) ?? { date: day.date, tempMin: null, tempMax: null, humidityMean: null };
      row[WEATHER_KEY[d.dimension]] = day.value;
      byDate.set(day.date, row);
    }
  }
  const weeks = weeklySeries([...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)));
  for (const d of report.dimensions) {
    out.set(
      d.dimension,
      weeks.map((w) => {
        const value = w[WEATHER_KEY[d.dimension]];
        // o ponto da semana fica no meio dela, dentro da janela
        const mid = addDays(w.date, 3);
        const date = mid < report.from ? report.from : mid > report.to ? report.to : mid;
        return { date, value, state: value == null ? null : classifyComfort(value, d.range, COMFORT_MARGIN[d.dimension]).state };
      }),
    );
  }
  return out;
}

/** Marcas do eixo: semanas ou quinzenas nas janelas curtas, meses nas longas. */
function ticksOf(from: IsoDate, to: IsoDate): Array<{ date: IsoDate; label: string }> {
  const span = daysBetween(from, to);
  if (span <= 70) {
    const step = span <= 35 ? 7 : 14;
    const out: Array<{ date: IsoDate; label: string }> = [];
    for (let i = span; i >= 0; i -= step) out.unshift({ date: addDays(from, i), label: shortDate(addDays(from, i)) });
    return out;
  }
  const out: Array<{ date: IsoDate; label: string }> = [];
  for (let d = from; d <= to; d = addDays(d, 1)) if (d === from || d.endsWith("-01")) out.push({ date: d, label: romanMonth(d) });
  return out;
}

/** Forma do ponto na fita, conforme a camada (ver docs/estudos/clima-e-ocorrencias.md). */
function Mark({ o, x, y }: { o: Occurrence; x: number; y: number }) {
  if (o.kind === "photo") return <rect x={x - 4} y={y - 4} width={8} height={8} rx={1.5} fill="var(--folha)" stroke="var(--tinta)" strokeWidth={1.3} />;
  if (o.kind !== "event") return null;
  const layer = EVENT_LAYER[o.type];
  if (layer === "health") return <path d={`M${x} ${y - 5}L${x + 5} ${y}L${x} ${y + 5}L${x - 5} ${y}Z`} fill="var(--ocre)" />;
  if (layer === "care") return <rect x={x - 0.7} y={y - 4} width={1.4} height={8} fill="var(--contorno)" />;
  if (layer === "notes") return <circle cx={x} cy={y} r={3.3} fill="none" stroke="var(--musgo)" strokeWidth={1.2} />;
  const color =
    o.type === "bloom_start" || o.type === "bloom_end" ? "var(--orquidea)" : o.type === "moved" || o.type === "repotting" ? "var(--ocre)" : "var(--folhagem)";
  return <circle cx={x} cy={y} r={4.2} fill={color} />;
}

function clusterLabel(c: OccurrenceCluster<Occurrence>) {
  const when = c.days.length > 1 ? `${shortDate(c.days[0]!)} a ${herbariumDate(c.days.at(-1)!, "UTC")}` : herbariumDate(c.days[0]!, "UTC");
  if (c.items.length === 1) return `${occurrenceLabel(c.items[0]!)}, ${when}`;
  return `${c.items.length} ocorrências, ${when}`;
}

function Pauta({
  plantName,
  report,
  locations,
  items,
  view,
  selected,
  onSelect,
}: {
  plantName: string;
  report: Report;
  locations: PlantLocation[];
  items: Occurrence[];
  view: View;
  selected: Selection | null;
  onSelect: (selection: Selection | null) => void;
}) {
  const [ref, W] = useWidth();
  const { from, to } = report;
  const n = daysBetween(from, to) + 1;
  const plotW = Math.max(0, W - L - R);
  const t0 = startOfLocalDay(from, LOCAL_TZ).getTime();
  const t1 = startOfLocalDay(addDays(to, 1), LOCAL_TZ).getTime();
  const xAt = (ms: number) => L + ((ms - t0) / (t1 - t0)) * plotW;
  /** Cada dia ocupa uma fatia do eixo; o ponto fica no meio dela */
  const xDay = (date: IsoDate) => L + ((daysBetween(from, date) + 0.5) / n) * plotW;

  const weekly = isWeeklyChart(from, to);
  const series = seriesOf(report, weekly);
  const panels = report.dimensions;
  const yAxis = TOP + panels.length * (PANEL_H + PANEL_GAP) - PANEL_GAP + 2;
  const yStrip = yAxis + 30;
  const H = yStrip + 16;

  const visible = view.events ? items.filter((o) => view.layers.includes(layerOf(o) as OccurrenceLayer)) : [];
  const clusters = clusterOccurrences(visible, dayOf, xDay);
  const selectedIndex = selected ? clusters.findIndex((c) => c.items.some((o) => occurrenceKey(o) === selected.key)) : -1;
  const selectedCluster = clusters[selectedIndex] ?? null;
  const moves = view.events && view.layers.includes("milestones") ? items.filter((o) => o.kind === "event" && o.type === "moved") : [];

  // chuva somada por dia ou por semana, como a linha
  const rain = new Map<IsoDate, number>();
  if (view.rain) {
    for (const p of report.precipitation) {
      if (!p.mm) continue;
      const key = weekly ? weekStart(p.date) : p.date;
      rain.set(key, (rain.get(key) ?? 0) + p.mm);
    }
  }
  const rainMax = Math.max(8, ...rain.values());
  const rainW = Math.max(1.6, (plotW / n) * (weekly ? 7 : 1) * 0.7);

  let lastTick = -Infinity;
  const ticks = ticksOf(from, to).filter((t) => {
    const x = xDay(t.date);
    if (x - lastTick < TICK_MIN_GAP) return false;
    lastTick = x;
    return true;
  });

  return (
    <div ref={ref}>
      {W > 0 && (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width={W}
          height={H}
          className="block touch-manipulation"
          role="group"
          aria-label={`Noites, dias e umidade de ${herbariumDate(from, "UTC")} a ${herbariumDate(to, "UTC")}, com as ocorrências da planta numa fita abaixo`}
        >
          {panels.map((d, i) => {
            const top = TOP + i * (PANEL_H + PANEL_GAP);
            const points = series.get(d.dimension) ?? [];
            const values = points.flatMap((p) => (p.value == null ? [] : [p.value]));
            const { min, max } = d.range;
            const lo = Math.min(...values, min ?? Infinity, max ?? Infinity) - 2;
            const hi = Math.max(...values, max ?? -Infinity, min ?? -Infinity) + 2;
            const y = (v: number) => top + (1 - (v - lo) / (hi - lo)) * PANEL_H;
            const clampY = (v: number) => Math.max(top + 2, Math.min(top + PANEL_H - 2, y(v)));
            const bandTop = max != null ? y(max) : top;
            const bandBottom = min != null ? y(min) : top + PANEL_H;
            const unit = unitOf(d.dimension);

            // a linha quebra nos dias sem clima
            const segments: string[] = [];
            let cur: string[] = [];
            for (const p of points) {
              if (p.value == null) {
                if (cur.length) segments.push(cur.join(" "));
                cur = [];
              } else cur.push(`${xDay(p.date).toFixed(1)},${y(p.value).toFixed(1)}`);
            }
            if (cur.length) segments.push(cur.join(" "));

            const readings = view.readings
              ? report.readings.flatMap((r) => {
                  const v = d.dimension === "humidity" ? r.humidity : r.panel === d.dimension ? r.temperature : null;
                  return v == null ? [] : [{ id: r.id, x: xAt(Date.parse(r.measuredAt)), y: clampY(v) }];
                })
              : [];

            return (
              <g key={d.dimension}>
                <rect x={L} y={bandTop} width={plotW} height={Math.max(0, bandBottom - bandTop)} fill="var(--salvia)" opacity={0.9} />
                {d.dimension === "humidity" &&
                  [...rain].map(([date, mm]) => {
                    const h = (mm / rainMax) * PANEL_H * 0.5;
                    const cx = weekly ? xDay(date < from ? from : date) + (plotW / n) * 3 : xDay(date);
                    return <rect key={date} x={cx - rainW / 2} y={top + PANEL_H - h} width={rainW} height={h} fill="var(--contorno)" opacity={0.5} />;
                  })}
                {[min, max].map((v) =>
                  v == null ? null : (
                    <text key={`r${v}`} x={L - 4} y={y(v) + 3} textAnchor="end" fontSize={8} fontFamily={mono} fill="var(--musgo)">
                      {num(v)}
                      {unit}
                    </text>
                  ),
                )}
                {segments.map((pts) => (
                  <polyline key={pts} points={pts} fill="none" stroke="var(--folhagem)" strokeWidth={1.25} />
                ))}
                {points.map((p) =>
                  p.state === "outside" && p.value != null ? <circle key={p.date} cx={xDay(p.date)} cy={y(p.value)} r={2} fill="var(--ocre)" /> : null,
                )}
                {readings.map((r) => (
                  <path
                    key={r.id}
                    d={`M${(r.x - 3.2).toFixed(1)} ${(r.y - 3.2).toFixed(1)}l6.4 6.4M${(r.x + 3.2).toFixed(1)} ${(r.y - 3.2).toFixed(1)}l-6.4 6.4`}
                    stroke="var(--orquidea)"
                    strokeWidth={1.3}
                  />
                ))}
                <text x={L} y={top - 4} fontSize={8.5} fontFamily={mono} fill="var(--musgo)" letterSpacing="0.08em">
                  {DIMENSION_NAME[d.dimension].toUpperCase()}
                  {weekly ? " · POR SEMANA" : ""}
                </text>
                <line x1={L} x2={W - R} y1={top + PANEL_H} y2={top + PANEL_H} stroke="var(--linha)" />
              </g>
            );
          })}

          {moves.map((m) => {
            const x = xAt(Date.parse(m.at));
            return <line key={m.id} x1={x} x2={x} y1={TOP} y2={yStrip + 8} stroke="var(--ocre)" strokeDasharray="3 3" opacity={0.7} />;
          })}
          {selectedCluster && (
            <line x1={selectedCluster.x} x2={selectedCluster.x} y1={TOP} y2={yStrip + 8} stroke="var(--tinta)" strokeDasharray="2 3" opacity={0.7} />
          )}

          <line x1={L} x2={W - R} y1={yAxis} y2={yAxis} stroke="var(--linha)" />
          {ticks.map((t) => {
            const x = xDay(t.date);
            return (
              <g key={t.date}>
                <line x1={x} x2={x} y1={yAxis} y2={yAxis + 3} stroke="var(--contorno)" />
                <text x={x} y={yAxis + 13} textAnchor="middle" fontSize={8.5} fontFamily={mono} fill="var(--musgo)">
                  {t.label}
                </text>
              </g>
            );
          })}

          <line x1={L} x2={W - R} y1={yStrip} y2={yStrip} stroke="var(--linha)" strokeDasharray="1 3" />
          {clusters.map((c) => {
            const key = occurrenceKey(c.items[0]!);
            const isSelected = c === selectedCluster;
            const choose = (origin: Origin) => onSelect({ key, origin });
            return (
              <g key={key}>
                {c.items.length === 1 ? (
                  <Mark o={c.items[0]!} x={c.x} y={yStrip} />
                ) : (
                  <>
                    <circle cx={c.x} cy={yStrip} r={8} fill="var(--folha)" stroke="var(--tinta)" strokeWidth={1.2} />
                    <text x={c.x} y={yStrip + 3.2} textAnchor="middle" fontSize={9} fontFamily={mono} fill="var(--tinta)">
                      {c.items.length}
                    </text>
                  </>
                )}
                {isSelected && <circle cx={c.x} cy={yStrip} r={10.5} fill="none" stroke="var(--tinta)" strokeWidth={1} />}
                {/* alvo de toque de 24 × 28, maior que o desenho */}
                <rect
                  x={c.x - 12}
                  y={yStrip - 14}
                  width={24}
                  height={28}
                  fill="transparent"
                  role="button"
                  tabIndex={0}
                  aria-haspopup="dialog"
                  aria-label={clusterLabel(c)}
                  data-key={key}
                  className="cursor-pointer outline-none focus-visible:stroke-orquidea"
                  onClick={(e) => choose({ x: e.clientX, y: e.clientY })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      const r = e.currentTarget.getBoundingClientRect();
                      choose({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
                    }
                  }}
                />
              </g>
            );
          })}
        </svg>
      )}
      {selected && selectedIndex >= 0 && (
        <OccurrenceSheet
          plantName={plantName}
          report={report}
          locations={locations}
          clusters={clusters}
          index={selectedIndex}
          origin={selected.origin}
          onNavigate={(i) => onSelect({ key: occurrenceKey(clusters[i]!.items[0]!), origin: selected.origin })}
          onClose={() => {
            onSelect(null);
            // devolve o foco ao ponto de onde a folha saiu
            ref.current?.querySelector<SVGRectElement>(`[data-key="${selected.key}"]`)?.focus();
          }}
        />
      )}
    </div>
  );
}

function Legend({ view }: { view: View }) {
  const swatch = "inline-block size-[9px] shrink-0 rounded-[2px]";
  return (
    <ul className="flex flex-wrap gap-x-3.5 gap-y-0.5 px-1 pt-2 text-[0.7rem] text-musgo" aria-hidden="true">
      <li className="flex items-center gap-1.5">
        <i className={`${swatch} bg-salvia`} />
        faixa da ficha
      </li>
      <li className="flex items-center gap-1.5">
        <i className={`${swatch} bg-folhagem`} />
        clima do dia
      </li>
      <li className="flex items-center gap-1.5">
        <i className={`${swatch} rounded-full bg-ocre`} />
        fora
      </li>
      {view.readings && (
        <li className="flex items-center gap-1.5">
          <span className="font-mono text-[0.8rem] leading-none text-orquidea">×</span>
          medição
        </li>
      )}
      {view.events && (
        <li className="flex items-center gap-1.5">
          <i className={`${swatch} rounded-full bg-orquidea`} />
          ocorrência
        </li>
      )}
    </ul>
  );
}

/** Uma linha por dimensão, contando DIAS, mesmo quando o desenho está agregado por semana. */
function Counts({ report }: { report: Report }) {
  return (
    <div className="mt-2 flex flex-col gap-1 border-t border-dotted border-contorno px-1 pt-2">
      {report.dimensions.map((d: ComfortDimensionReport) => (
        <p key={d.dimension} className="flex flex-wrap items-baseline gap-x-2 text-[0.78rem]">
          <span className="eyebrow w-[4.6rem]">{DIMENSION_NAME[d.dimension]}</span>
          <span>
            <b className="font-medium">{d.counts.inside}</b> dentro · <b className="font-medium">{d.counts.near}</b> perto ·{" "}
            <b className="font-medium">{d.counts.outside}</b> fora
          </span>
          {d.worst && (
            <span className="font-mono text-[0.72rem] text-ocre">
              pior {num(d.worst.value!)}
              {unitOf(d.dimension)} em {shortDate(d.worst.date)}
            </span>
          )}
        </p>
      ))}
    </div>
  );
}

/**
 * "Faixa do gênero Phalaenopsis" quando a ficha da planta herda as faixas de um ancestral;
 * numa cruza, de qual parental veio a ficha ("faixa de Renanthera monachica, a semente · é uma cruza").
 */
function InheritedNote({ report }: { report: Report }) {
  if (report.crossCare) {
    return (
      <p className="mt-1.5 px-1 text-[0.74rem] text-musgo">
        Faixa de <span className="taxon">{report.crossCare.fullName}</span>, {CROSS_SIDE_LABEL[report.crossCare.side]}
        {report.crossCare.fromGrex && " do grex"} · é uma cruza
      </p>
    );
  }
  const sources = new Map(report.dimensions.flatMap((d) => (d.inheritedFrom ? [[d.inheritedFrom.fullName, d.inheritedFrom] as const] : [])));
  if (!sources.size) return null;
  return (
    <p className="mt-1.5 px-1 text-[0.74rem] text-musgo">
      {[...sources.values()].map((s, i) => (
        <span key={s.fullName}>
          {i > 0 && " · "}
          Faixa do {s.rankLabel} <span className="taxon">{s.fullName}</span>
        </span>
      ))}
    </p>
  );
}
