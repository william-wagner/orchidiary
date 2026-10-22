import { COMFORT_DIMENSION_LABEL, COMFORT_LABEL, type ComfortDay, type ComfortRange, herbariumDate } from "@orchidiary/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, type ComfortDimensionReport, type PlantComfort } from "../lib/api.ts";
import { Icon } from "./ui.tsx";

/**
 * A seção vem recolhida; quem abre fica com ela aberta (lembrado no aparelho,
 * vale para todas as plantas).
 */
const OPEN_KEY = "orchidiary:conforto-aberto";

function readCollapsed() {
  try {
    return localStorage.getItem(OPEN_KEY) !== "1";
  } catch {
    return true;
  }
}

function saveCollapsed(collapsed: boolean) {
  try {
    if (collapsed) localStorage.removeItem(OPEN_KEY);
    else localStorage.setItem(OPEN_KEY, "1");
  } catch {
    // sem armazenamento (aba anônima): só não lembra
  }
}

const STATE_LABEL = { inside: "dentro da faixa", near: "perto", outside: "fora" } as const;

/** 16.X (sem o ano, para as marcas da fita) */
const shortDate = (iso: string) => herbariumDate(iso, "UTC").replace(/\.\d{4}$/, "");
const num = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const unitOf = (r: ComfortDimensionReport) => (r.dimension === "humidity" ? "%" : " °C");

function rangeText(range: ComfortRange, unit: string) {
  if (range.min != null && range.max != null) return `${num(range.min)}–${num(range.max)}${unit}`;
  if (range.min != null) return `a partir de ${num(range.min)}${unit}`;
  return `até ${num(range.max!)}${unit}`;
}

const TICK: Record<string, string> = {
  inside: "bg-salvia",
  near: "bg-ocre-claro shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--ocre)_45%,transparent)]",
  outside: "bg-ocre",
  none: "bg-transparent shadow-[inset_0_0_0_1px_var(--linha)]",
};

/**
 * Seção Conforto da ficha: os últimos 30 dias no local atual, por dimensão
 * (noites, dias, umidade), contra as faixas da ficha de cultivo.
 */
export function ComfortPanel({ plantId }: { plantId: string }) {
  // até a seção nova (Clima e ocorrências), a janela antiga de 30 dias
  const comfort = useQuery({ queryKey: ["comfort", plantId], queryFn: () => api.get<PlantComfort>(`/plants/${plantId}/comfort?days=30`) });
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const c = comfort.data;
  if (!c || c.status === "no_location") return null;
  const toggle = () => {
    setCollapsed(!collapsed);
    saveCollapsed(!collapsed);
  };

  if (c.status === "no_ranges") {
    return (
      <section className="mt-5 rounded-xl border border-dashed border-contorno px-4 py-4 text-[0.86rem] text-musgo" aria-label="Conforto">
        <p className="font-serif text-[1.15rem] text-tinta">Conforto</p>
        <p className="mt-1">A ficha de cultivo desta planta não tem faixas de temperatura nem de umidade para comparar com o clima.</p>
      </section>
    );
  }

  const arrivedLater = c.since.slice(0, 10) > c.from;
  // o que o selo do card mostraria (sem os silenciados), para o resumo da seção encolhida
  const problems = c.dimensions.filter((d) => d.attention.direction && !d.silenced);
  return (
    <section className="cartao mt-5 px-4 py-4" aria-label="Conforto">
      <h2>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-controls={`conforto-${plantId}`}
          className="flex w-full items-baseline justify-between gap-3 text-left"
        >
          <span className="flex items-center gap-1.5 font-serif text-[1.3rem]">
            <Icon name="chevron" className={`size-4 self-center transition-transform ${collapsed ? "" : "rotate-90"}`} />
            Conforto
          </span>
          <span className="typed text-[0.7rem] whitespace-nowrap">
            {shortDate(c.from)} – {herbariumDate(c.to, "UTC")}
          </span>
        </button>
      </h2>
      {collapsed ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[0.8rem] text-musgo">
          {problems.length ? (
            problems.map((d) => (
              <span key={d.dimension} className="selo selo-ocre">
                {COMFORT_LABEL[d.dimension][d.attention.direction as -1 | 1]}
              </span>
            ))
          ) : (
            <span>Tudo dentro da faixa na última semana.</span>
          )}
          {c.environment === "indoor" && <span>Clima de fora, só referência.</span>}
        </div>
      ) : (
        <div id={`conforto-${plantId}`}>
          <p className="mt-1 text-[0.82rem] text-musgo">
            {c.placeName ? `${c.placeName} · ` : ""}clima diário do local contra a faixa da ficha
            {arrivedLater && <> · aqui desde {herbariumDate(c.since, "UTC")}</>}
          </p>
          {c.environment === "indoor" && (
            <p className="mt-2.5 rounded-lg border border-dashed border-ocre bg-ocre-claro/60 px-3 py-2 text-[0.8rem] text-ocre">
              A planta está dentro de casa, e o clima comparado é o de fora: use só como referência. A temperatura e a umidade de dentro
              podem ser bem diferentes.
            </p>
          )}
          <ul className="mt-2.5 flex flex-wrap gap-3 text-[0.72rem] text-musgo" aria-hidden="true">
            {(["inside", "near", "outside"] as const).map((s) => (
              <li key={s} className="flex items-center gap-1.5">
                <span className={`inline-block size-2.5 rounded-[2px] ${TICK[s]}`} />
                {s === "inside" ? "dentro" : STATE_LABEL[s]}
              </li>
            ))}
          </ul>
          <div className="mt-3 space-y-2.5">
            {c.dimensions.map((d) => (
              <Dimension key={d.dimension} plantId={plantId} report={d} defaultOpen={!!d.attention.direction} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function Dimension({ plantId, report, defaultOpen }: { plantId: string; report: ComfortDimensionReport; defaultOpen: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(defaultOpen);
  const [selected, setSelected] = useState<number | null>(null);
  const unit = unitOf(report);
  const days = report.days;
  const day = selected != null ? days[selected] : null;
  const problem = report.attention.direction ? COMFORT_LABEL[report.dimension][report.attention.direction] : null;

  const silence = useMutation({
    mutationFn: (on: boolean) =>
      on ? api.put(`/plants/${plantId}/comfort/silences/${report.dimension}`, {}) : api.delete(`/plants/${plantId}/comfort/silences/${report.dimension}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["comfort", plantId] });
      qc.invalidateQueries({ queryKey: ["plants"] });
    },
  });

  return (
    <div className="rounded-lg border border-linha bg-papel/60 px-3 py-3">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-baseline justify-between gap-2 text-left">
        <span className="flex items-center gap-1.5 text-[0.92rem] font-medium">
          <Icon name="chevron" className={`size-3.5 transition-transform ${open ? "rotate-90" : ""}`} />
          {COMFORT_DIMENSION_LABEL[report.dimension]}
        </span>
        <span className="typed text-[0.72rem]">faixa {rangeText(report.range, unit)}</span>
      </button>

      <div className="mt-2.5 grid h-6 gap-[2px]" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }} role="group" aria-label={`${COMFORT_DIMENSION_LABEL[report.dimension]} dia a dia`}>
        {days.map((d, i) => (
          <button
            key={d.date}
            type="button"
            aria-pressed={selected === i}
            aria-label={`${shortDate(d.date)}: ${d.state ? STATE_LABEL[d.state] : "sem dado"}`}
            onClick={() => setSelected(selected === i ? null : i)}
            className={`rounded-[2px] ${TICK[d.state ?? "none"]} ${selected === i ? "outline-2 outline-offset-1 outline-tinta" : ""}`}
          />
        ))}
      </div>
      <div className="typed mt-1 flex justify-between text-[0.62rem]" aria-hidden="true">
        <span>{shortDate(days[0]!.date)}</span>
        <span>{shortDate(days.at(-1)!.date)}</span>
      </div>

      {open && <Chart report={report} unit={unit} selected={selected} />}

      <p className="mt-2 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[0.78rem] text-musgo">
        <span>
          <b className="font-medium text-tinta">{report.counts.inside}</b> dentro
        </span>
        <span>
          <b className="font-medium text-tinta">{report.counts.near}</b> perto
        </span>
        <span>
          <b className="font-medium text-tinta">{report.counts.outside}</b> fora
        </span>
        {report.worst && (
          <span>
            pior: {num(report.worst.value!)}
            {unit} em {shortDate(report.worst.date)}
          </span>
        )}
      </p>
      {day && <p className="mt-1 text-[0.8rem]">{dayLine(day, unit)}</p>}
      {report.inheritedFrom && (
        <p className="mt-1 text-[0.74rem] text-musgo">
          Faixa do {report.inheritedFrom.rankLabel} <span className="taxon">{report.inheritedFrom.fullName}</span>
        </p>
      )}

      {report.silenced ? (
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[0.78rem] text-musgo">
          Silenciado até a planta mudar de local.
          <button type="button" disabled={silence.isPending} onClick={() => silence.mutate(false)} className="min-h-9 text-orquidea underline underline-offset-3">
            Voltar a avisar
          </button>
        </p>
      ) : (
        problem && (
          <button
            type="button"
            disabled={silence.isPending}
            onClick={() => silence.mutate(true)}
            className="mt-1 min-h-9 text-left text-[0.78rem] text-orquidea underline underline-offset-3"
          >
            Já sei, não avisar sobre {problem}
          </button>
        )
      )}
    </div>
  );
}

function dayLine(d: ComfortDay, unit: string) {
  if (d.value == null) return `${shortDate(d.date)} · sem clima registrado`;
  const base = `${shortDate(d.date)} · ${num(d.value)}${unit}`;
  if (!d.state || d.state === "inside") return `${base} · dentro da faixa`;
  const amount = unit === "%" ? `${num(d.diff)} pontos` : `${num(d.diff)} °C`;
  return `${base} · ${STATE_LABEL[d.state]} (${amount} ${d.direction < 0 ? "abaixo" : "acima"})`;
}

/** Valor diário com a faixa ao fundo */
function Chart({ report, unit, selected }: { report: ComfortDimensionReport; unit: string; selected: number | null }) {
  const W = 320;
  const H = 120;
  const L = 34;
  const R = 8;
  const T = 8;
  const B = 18;
  const values = report.days.map((d) => d.value).filter((v): v is number => v != null);
  if (!values.length) return null;
  const { min, max } = report.range;
  const lo = Math.floor(Math.min(...values, min ?? Infinity) - 2);
  const hi = Math.ceil(Math.max(...values, max ?? -Infinity) + 2);
  const n = report.days.length;
  const x = (i: number) => L + (n === 1 ? 0 : (i / (n - 1)) * (W - L - R));
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const bandTop = y(max ?? hi);
  const bandBottom = y(min ?? lo);
  // a linha quebra nos dias sem clima
  const segments: string[] = [];
  let cur: string[] = [];
  report.days.forEach((d, i) => {
    if (d.value == null) {
      if (cur.length) segments.push(cur.join(" "));
      cur = [];
    } else cur.push(`${x(i).toFixed(1)},${y(d.value).toFixed(1)}`);
  });
  if (cur.length) segments.push(cur.join(" "));
  const label = (v: number) => (
    <text x={L - 5} y={y(v) + 3} textAnchor="end" fontSize="9" fill="var(--musgo)" fontFamily="var(--font-mono)">
      {num(v)}
    </text>
  );
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 block w-full" role="img" aria-label={`${COMFORT_DIMENSION_LABEL[report.dimension]} diária contra a faixa ${rangeText(report.range, unit)}`}>
      <rect x={L} y={bandTop} width={W - L - R} height={Math.max(0, bandBottom - bandTop)} fill="var(--salvia)" />
      {max != null && <line x1={L} x2={W - R} y1={y(max)} y2={y(max)} stroke="var(--contorno)" strokeDasharray="2 3" />}
      {min != null && <line x1={L} x2={W - R} y1={y(min)} y2={y(min)} stroke="var(--contorno)" strokeDasharray="2 3" />}
      {max != null && label(max)}
      {min != null && label(min)}
      {segments.map((pts) => (
        <polyline key={pts} points={pts} fill="none" stroke="var(--folhagem)" strokeWidth="1.4" />
      ))}
      {report.days.map((d, i) =>
        d.value == null ? null : (
          <circle
            key={d.date}
            cx={x(i)}
            cy={y(d.value)}
            r={selected === i ? 4 : d.state === "inside" ? 1.8 : 2.8}
            fill={d.state === "outside" ? "var(--ocre)" : d.state === "near" ? "var(--ocre-claro)" : "var(--tinta)"}
            stroke={d.state === "near" || selected === i ? "var(--ocre)" : "none"}
          />
        ),
      )}
      <text x={L} y={H - 4} fontSize="9" fill="var(--musgo)" fontFamily="var(--font-mono)">
        {shortDate(report.days[0]!.date)}
      </text>
      <text x={W - R} y={H - 4} textAnchor="end" fontSize="9" fill="var(--musgo)" fontFamily="var(--font-mono)">
        {shortDate(report.days.at(-1)!.date)}
      </text>
    </svg>
  );
}
