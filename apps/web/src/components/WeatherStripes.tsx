import type { WeatherDay } from "../lib/api.ts";

/** Escala fria → quente, pensada para a faixa de conforto das orquídeas (≈ 5–35 °C). */
const STOPS: Array<[number, [number, number, number]]> = [
  [5, [43, 76, 140]],
  [12, [94, 145, 186]],
  [18, [150, 190, 160]],
  [23, [214, 200, 120]],
  [28, [222, 140, 70]],
  [35, [168, 44, 44]],
];

export function tempColor(t: number | null): string {
  if (t == null) return "var(--velame-2)";
  const first = STOPS[0]!;
  const last = STOPS.at(-1)!;
  if (t <= first[0]) return `rgb(${first[1].join(",")})`;
  if (t >= last[0]) return `rgb(${last[1].join(",")})`;
  const i = STOPS.findIndex(([v]) => v > t);
  const [v0, c0] = STOPS[i - 1]!;
  const [v1, c1] = STOPS[i]!;
  const k = (t - v0) / (v1 - v0);
  return `rgb(${c0.map((c, j) => Math.round(c + (c1[j]! - c) * k)).join(",")})`;
}

/**
 * Faixa de "listras de temperatura": cada barra é um dia, colorida pela média.
 * Mostra de relance períodos frios e quentes vividos pela planta.
 */
export function WeatherStripes({ days, height = 40 }: { days: WeatherDay[]; height?: number }) {
  if (!days.length) {
    return (
      <p className="rounded-lg bg-velame-2 px-3 py-2 text-sm text-musgo-2">
        O clima começa a aparecer amanhã cedo, depois da primeira coleta diária.
      </p>
    );
  }
  const last = days.at(-1)!;
  return (
    <figure>
      <div className="flex overflow-hidden rounded-lg" style={{ height }} role="img" aria-label={`Temperatura média dos últimos ${days.length} dias`}>
        {days.map((d) => (
          <div
            key={`${d.locationId}-${d.date}`}
            className="flex-1"
            style={{ background: tempColor(d.tempMean) }}
            title={`${d.date}: ${d.tempMin ?? "?"}–${d.tempMax ?? "?"} °C, umidade ${d.humidityMean ?? "?"}%`}
          />
        ))}
      </div>
      <figcaption className="mt-1 flex justify-between text-sm text-musgo-2">
        <span>{days[0]!.date.split("-").reverse().slice(0, 2).join("/")}</span>
        <span>
          Ontem: {last.tempMin}–{last.tempMax} °C, {last.humidityMean}% de umidade
          {last.precipitation ? `, ${last.precipitation} mm de chuva` : ""}
        </span>
      </figcaption>
    </figure>
  );
}
