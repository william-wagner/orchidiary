import type { WeatherDay } from "../lib/api.ts";

/**
 * Faixas de cor do registro térmico, na paleta do herbário.
 * Frio em tinta azul, conforto no verde da planta prensada, calor em kraft e ferrugem.
 */
const BANDS: Array<{ max: number; color: string; label: string }> = [
  { max: 16, color: "#22304A", label: "até 16 °C" },
  { max: 19, color: "#5D6E84", label: "17–19 °C" },
  { max: 22, color: "#66713F", label: "20–22 °C" },
  { max: 25, color: "#B89C6E", label: "23–25 °C" },
  { max: Infinity, color: "#8A4A2A", label: "26 °C ou mais" },
];

export function tempColor(t: number | null): string {
  if (t == null) return "var(--linha)";
  return BANDS.find((b) => t <= b.max)!.color;
}

/**
 * Registro térmico: um quadradinho por dia, colorido pela temperatura média,
 * como uma fileira de carimbos no livro do herbário.
 */
export function TemperatureRegister({ days }: { days: WeatherDay[] }) {
  if (!days.length) {
    return (
      <p className="typed border border-dashed border-linha px-3 py-2 text-[0.85rem]">
        O primeiro registro térmico entra amanhã cedo, depois da coleta diária do clima.
      </p>
    );
  }
  const last = days.at(-1)!;
  return (
    <figure>
      <div className="flex items-baseline justify-between gap-3">
        <figcaption className="text-lg font-medium">Registro térmico, {days.length} dias</figcaption>
        <span className="typed text-[0.8rem]">
          ontem {last.tempMin ?? "?"}–{last.tempMax ?? "?"} °C
        </span>
      </div>
      <div
        className="mt-1.5 grid gap-[2px]"
        style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
        role="img"
        aria-label={`Temperatura média diária dos últimos ${days.length} dias. Ontem: mínima ${last.tempMin} e máxima ${last.tempMax} graus, umidade de ${last.humidityMean}%.`}
      >
        {days.map((d) => (
          <div
            key={`${d.locationId}-${d.date}`}
            className="h-5"
            style={{ background: tempColor(d.tempMean) }}
            title={`${d.date}: ${d.tempMin ?? "?"}–${d.tempMax ?? "?"} °C, umidade ${d.humidityMean ?? "?"}%`}
          />
        ))}
      </div>
      <ul className="typed mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[0.72rem]" aria-hidden="true">
        {BANDS.map((b) => (
          <li key={b.label} className="flex items-center gap-1">
            <span className="inline-block size-2.5" style={{ background: b.color }} />
            {b.label}
          </li>
        ))}
      </ul>
    </figure>
  );
}
