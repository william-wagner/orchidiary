import { herbariumDate, type IsoDate } from "@orchidiary/shared";
import type { PlantComfort, WeatherDay } from "../lib/api.ts";
import { useWidth } from "../lib/useWidth.ts";
import { BANDS, tempColor } from "./TemperatureRegister.tsx";

type Report = Extract<PlantComfort, { status: "ok" }>;

/** Dias que o resumo da seção fechada cobre */
const DAYS = 30;
const H = 54;
const PAD = 4;
/** Margem esquerda para os limites da faixa ("30°C") */
const L = 34;
const R = 2;

/** 22.IX (sem o ano) */
const shortDate = (iso: IsoDate) => herbariumDate(iso, "UTC").split(".").slice(0, 2).join(".");

const dayTitle = (date: IsoDate, w: WeatherDay | undefined) =>
  `${date}: ${w ? `${w.tempMin ?? "?"}–${w.tempMax ?? "?"}°C` : "sem clima"}`;

/**
 * Resumo da seção "Clima e ocorrências" fechada, que também substitui o antigo Registro térmico:
 * uma coluna por dia dos últimos 30, da mínima à máxima, na cor da temperatura média, sobre a
 * faixa de conforto da ficha (da mínima das noites à máxima dos dias). A umidade fica com os selos.
 */
export function ClimateSummary({ report, weather }: { report: Report; weather: WeatherDay[] }) {
  const [ref, W] = useWidth();
  const dates = (report.dimensions[0]?.days ?? []).slice(-DAYS).map((d) => d.date);
  const byDate = new Map(weather.map((w) => [w.date, w]));
  const night = report.dimensions.find((d) => d.dimension === "night")?.range;
  const day = report.dimensions.find((d) => d.dimension === "day")?.range;
  const bandMin = night?.min ?? day?.min ?? null;
  const bandMax = day?.max ?? night?.max ?? null;

  const values = dates.flatMap((date) => {
    const w = byDate.get(date);
    return w ? [w.tempMin, w.tempMax].filter((v): v is number => v != null) : [];
  });
  if (!values.length) return null;

  const plotW = Math.max(0, W - L - R);
  const lo = Math.min(...values, bandMin ?? Infinity) - 1;
  const hi = Math.max(...values, bandMax ?? -Infinity) + 1;
  const y = (v: number) => PAD + (1 - (v - lo) / (hi - lo)) * (H - PAD * 2);
  const col = plotW / dates.length;
  const barW = Math.max(2, col * 0.62);

  return (
    <div ref={ref} className="mt-2.5">
      <p className="eyebrow">
        Últimos {dates.length} dias · {shortDate(dates[0]!)} – {shortDate(dates.at(-1)!)}
      </p>
      {W > 0 && (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width={W}
          height={H}
          className="block"
          role="img"
          aria-label={`Mínima e máxima de cada um dos últimos ${dates.length} dias sobre a faixa de conforto da ficha${
            bandMin != null && bandMax != null ? `, de ${Math.round(bandMin)} a ${Math.round(bandMax)}°C` : ""
          }`}
        >
          {bandMin != null && bandMax != null && <rect x={L} y={y(bandMax)} width={plotW} height={y(bandMin) - y(bandMax)} fill="var(--salvia)" opacity={0.9} />}
          {[bandMin, bandMax].map((v) =>
            v == null ? null : (
              <text key={v} x={L - 4} y={y(v) + 3} textAnchor="end" fontSize={8} fontFamily="var(--font-mono)" fill="var(--musgo)">
                {Math.round(v)}°C
              </text>
            ),
          )}
          {dates.map((date, i) => {
            const w = byDate.get(date);
            if (!w || w.tempMin == null || w.tempMax == null) return null;
            const top = y(w.tempMax);
            return (
              <rect
                key={date}
                x={L + col * i + (col - barW) / 2}
                y={top}
                width={barW}
                height={Math.max(2, y(w.tempMin) - top)}
                rx={Math.min(1.5, barW / 2)}
                fill={tempColor(w.tempMean)}
              >
                <title>{dayTitle(date, w)}</title>
              </rect>
            );
          })}
        </svg>
      )}
      <ul className="typed mt-2 flex flex-wrap gap-x-2 gap-y-0.5 text-[0.6rem]" aria-hidden="true">
        {BANDS.map((b) => (
          <li key={b.label} className="flex items-center gap-1">
            <span className="inline-block size-[9px] shrink-0 rounded-[2px]" style={{ background: b.color }} />
            {b.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
