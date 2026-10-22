import type { IconName } from "../components/ui.tsx";

/** Nome de cada tipo de evento do diário, como aparece no livro de registro e no gráfico. */
export const EVENT_LABEL: Record<string, string> = {
  note: "Anotação",
  watering: "Rega",
  fertilizing: "Adubação",
  repotting: "Replante",
  bloom_start: "Começou a florir",
  bloom_end: "Fim da floração",
  new_growth: "Broto novo",
  new_root: "Raiz nova",
  keiki: "Keiki",
  pest: "Praga",
  disease: "Doença",
  treatment: "Tratamento",
  moved: "Mudou de lugar",
};

/** Eventos que ganham selo no livro de registro e na folha do gráfico */
export const STAMPED: Record<string, string> = {
  bloom_start: "floração",
  bloom_end: "fim da flor",
  moved: "mudança",
  repotting: "replante",
  keiki: "keiki",
};

export const EVENT_ICON: Partial<Record<string, IconName>> = {
  watering: "drop",
  fertilizing: "sprout",
  bloom_start: "flower",
  bloom_end: "flower",
  new_growth: "sprout",
  new_root: "sprout",
  keiki: "sprout",
  moved: "pin",
};

/** Floração em lilás; mudanças de manejo em ocre; o resto em sálvia. */
export function stampTone(type: string) {
  if (type === "bloom_start" || type === "bloom_end") return "selo-flor";
  if (type === "moved" || type === "repotting") return "selo-ocre";
  return "";
}
