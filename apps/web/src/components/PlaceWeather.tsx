import type { PlaceWeatherDay } from "../lib/api.ts";

/** Último dia com clima coletado (ontem, depois da coleta da manhã). */
export const lastDay = (days: PlaceWeatherDay[]) => days.at(-1) ?? null;

const num = (v: number | null | undefined, digits = 1) => (v == null ? "—" : v.toFixed(digits).replace(".", ","));

/** Temperatura e umidade de ontem, em letra de máquina. */
export function PlaceReadout({ days }: { days: PlaceWeatherDay[] }) {
  const day = lastDay(days);
  if (!day) {
    return (
      <p className="typed text-[0.78rem] leading-relaxed">
        O clima deste lugar entra amanhã cedo, na próxima coleta.
      </p>
    );
  }
  return (
    <div className="flex items-end gap-6">
      <div>
        <p className="typed text-[1.5rem] leading-none text-tinta">{num(day.tempMean)}°C</p>
        <p className="eyebrow mt-1">
          {num(day.tempMin)} – {num(day.tempMax)} ontem
        </p>
      </div>
      <div>
        <p className="typed text-[1.5rem] leading-none text-tinta">{num(day.humidityMean, 0)} %</p>
        <p className="eyebrow mt-1">umidade média</p>
      </div>
    </div>
  );
}

interface Scale {
  min: number;
  max: number;
}

const scaleOf = (days: PlaceWeatherDay[]): Scale => {
  const values = days.flatMap((d) => [d.tempMin, d.tempMax].filter((v): v is number => v != null));
  if (!values.length) return { min: 0, max: 1 };
  const min = Math.min(...values);
  const max = Math.max(...values);
  return min === max ? { min: min - 1, max: max + 1 } : { min, max };
};

const W = 320;
const H = 56;
const y = (v: number, s: Scale) => H - ((v - s.min) / (s.max - s.min)) * H;
const x = (i: number, n: number) => (n < 2 ? W / 2 : (i / (n - 1)) * W);

/**
 * Faixa diária de temperatura do lugar: a área entre mínima e máxima, com a média por cima.
 * É o mesmo desenho na lista e na ficha, só muda a altura.
 */
export function PlaceSparkline({ days, className = "h-14" }: { days: PlaceWeatherDay[]; className?: string }) {
  const usable = days.filter((d) => d.tempMin != null && d.tempMax != null);
  if (usable.length < 2) return null;
  const s = scaleOf(usable);
  const band = [
    ...usable.map((d, i) => `${i === 0 ? "M" : "L"} ${x(i, usable.length).toFixed(1)} ${y(d.tempMax!, s).toFixed(1)}`),
    ...[...usable].reverse().map((d, i) => `L ${x(usable.length - 1 - i, usable.length).toFixed(1)} ${y(d.tempMin!, s).toFixed(1)}`),
    "Z",
  ].join(" ");
  const mean = usable
    .map((d, i) => `${x(i, usable.length).toFixed(1)} ${y(d.tempMean ?? (d.tempMin! + d.tempMax!) / 2, s).toFixed(1)}`)
    .join(",");
  const first = usable[0]!;
  const last = usable.at(-1)!;
  return (
    <figure className="mt-2">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className={`w-full ${className}`}
        role="img"
        aria-label={`Temperatura dos últimos ${usable.length} dias: de ${s.min.toFixed(0)} a ${s.max.toFixed(0)} graus.`}
      >
        <path d={band} fill="var(--salvia)" />
        <polyline points={mean} fill="none" stroke="var(--folhagem)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption className="typed flex justify-between text-[0.64rem]">
        <span>{first.date.slice(8, 10)}/{first.date.slice(5, 7)}</span>
        <span>
          {s.min.toFixed(0)}–{s.max.toFixed(0)}°C em {usable.length} dias
        </span>
        <span>{last.date.slice(8, 10)}/{last.date.slice(5, 7)}</span>
      </figcaption>
    </figure>
  );
}
