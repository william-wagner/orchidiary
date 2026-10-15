/** Pressão de vapor de saturação (kPa), fórmula de Tetens. */
export function saturationVaporPressure(tempC: number): number {
  return 0.6108 * Math.exp((17.27 * tempC) / (tempC + 237.3));
}

/** Déficit de pressão de vapor (kPa). Bom indicador de "secura" do ar para orquídeas. */
export function vpd(tempC: number, relativeHumidity: number): number {
  return saturationVaporPressure(tempC) * (1 - relativeHumidity / 100);
}

export interface HourlySample {
  temperature: number | null;
  humidity: number | null;
  dewPoint: number | null;
}

export interface HumidityDaily {
  humidityMean: number | null;
  humidityMin: number | null;
  humidityMax: number | null;
  dewPointMean: number | null;
  vpdMean: number | null;
  vpdMax: number | null;
}

const round = (n: number, digits = 1) => Math.round(n * 10 ** digits) / 10 ** digits;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Consolida as amostras horárias de um dia em métricas diárias. */
export function aggregateHourly(samples: HourlySample[]): HumidityDaily {
  const rh = samples.map((s) => s.humidity).filter((x): x is number => x != null);
  const dew = samples.map((s) => s.dewPoint).filter((x): x is number => x != null);
  const vpds = samples
    .filter((s) => s.temperature != null && s.humidity != null)
    .map((s) => vpd(s.temperature as number, s.humidity as number));
  const m = (xs: number[], digits?: number) => {
    const v = mean(xs);
    return v == null ? null : round(v, digits);
  };
  return {
    humidityMean: m(rh),
    humidityMin: rh.length ? Math.min(...rh) : null,
    humidityMax: rh.length ? Math.max(...rh) : null,
    dewPointMean: m(dew),
    vpdMean: m(vpds, 2),
    vpdMax: vpds.length ? round(Math.max(...vpds), 2) : null,
  };
}
