import type { WeatherDay } from "../lib/api.ts";

/**
 * Faixas de cor do registro térmico, na paleta do caderno.
 * Frio em azul acinzentado, conforto em verdes, calor em ocre e terracota.
 */
export const BANDS: Array<{ max: number; color: string; label: string }> = [
  { max: 16, color: "#8FA8BA", label: "até 16 °C" },
  { max: 19, color: "#A9C3A0", label: "17–19 °C" },
  { max: 22, color: "#6F9A6A", label: "20–22 °C" },
  { max: 25, color: "#D8B06C", label: "23–25 °C" },
  { max: Infinity, color: "#C0735A", label: "26 °C ou mais" },
];

export function tempColor(t: number | null): string {
  if (t == null) return "var(--linha)";
  return BANDS.find((b) => t <= b.max)!.color;
}

/**
 * Registro térmico: um quadradinho por dia, colorido pela temperatura média,
 * como uma faixa de aquarela na página do caderno.
 */
export function TemperatureRegister({ days }: { days: WeatherDay[] }) {
  if (!days.length) {
    return (
      <p className="typed text-[0.78rem] leading-relaxed">
        O primeiro registro térmico entra amanhã cedo, depois da coleta diária do clima.
      </p>
    );
  }
  const last = days.at(-1)!;
  return (
    <figure>
      <div className="flex items-baseline justify-between gap-3">
        <figcaption className="font-serif text-[1.3rem]">Registro térmico, {days.length} dias</figcaption>
        <span className="typed text-[0.7rem] whitespace-nowrap">
          ontem {last.tempMin ?? "?"}–{last.tempMax ?? "?"} °C
        </span>
      </div>
      <div
        className="mt-3 grid gap-[3px]"
        style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
        role="img"
        aria-label={`Temperatura média diária dos últimos ${days.length} dias. Ontem: mínima ${last.tempMin} e máxima ${last.tempMax} graus, umidade de ${last.humidityMean}%.`}
      >
        {days.map((d) => (
          <div
            key={`${d.sourceId}-${d.date}`}
            className="h-6 rounded-[3px]"
            style={{ background: tempColor(d.tempMean) }}
            title={`${d.date}: ${d.tempMin ?? "?"}–${d.tempMax ?? "?"} °C, umidade ${d.humidityMean ?? "?"}%`}
          />
        ))}
      </div>
      <ul className="typed mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[0.64rem]" aria-hidden="true">
        {BANDS.map((b) => (
          <li key={b.label} className="flex items-center gap-1">
            <span className="inline-block size-2 rounded-[2px]" style={{ background: b.color }} />
            {b.label}
          </li>
        ))}
      </ul>
    </figure>
  );
}
