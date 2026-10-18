import { formatAccession, herbariumDate } from "@orchidiary/shared";

/** Fuso do aparelho: as datas do diário aparecem no dia local de quem está vendo. */
export const LOCAL_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo";

/** 14.X.2026 */
export const typedDate = (d: Date | string) => herbariumDate(d, LOCAL_TZ);

/** Tombo nº 0007 */
export const accession = (n: number | null | undefined) => `Tombo nº ${formatAccession(n)}`;

export const environmentLabel = (env: "indoor" | "outdoor" | undefined) =>
  env === "indoor" ? "dentro de casa" : "ao ar livre";

/** Coordenadas como dado de coleta: "-19.9167, -43.9345" */
export const coords = (p: { lat: number; lng: number }) => `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`;

/** Mês e ano por extenso, para separar o livro de registro: "outubro de 2026" */
export const monthHeading = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
