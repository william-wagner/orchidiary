import { normalizeSearch } from "./taxonomy.ts";

/** Assinatura que acompanha tudo o que sai do app. */
export const SHARE_SLOGAN = "Cultive o seu melhor.";
export const SHARE_SITE = "orchidiary.com";

/** O que vai junto com uma foto compartilhada. Nomes já resolvidos e data já no formato de etiqueta. */
export interface SharePhotoInfo {
  nickname: string;
  /** Nome da planta em texto corrido (táxon ou fórmula da cruza); null quando não determinada */
  name: string | null;
  /** Data da foto, como na etiqueta: "14.X.2026" */
  date: string;
  /** Quem cultiva; null omite a linha */
  grower: string | null;
  /** Legenda da foto, se houver */
  caption?: string | null;
}

const clean = (s: string | null | undefined) => s?.replace(/\s+/g, " ").trim() || null;

/**
 * Texto que vai junto com a foto (WhatsApp e Telegram usam como legenda):
 *
 *   Aurora — Renanthera monachica × Vanda falcata
 *   Foto de 14.X.2026 · cultivada por Ana
 *   “Primeira flor do ano”
 *
 *   Cultive o seu melhor. orchidiary.com
 */
export function shareCaption(info: SharePhotoInfo): string {
  const nickname = clean(info.nickname);
  const name = clean(info.name);
  const grower = clean(info.grower);
  const caption = clean(info.caption);
  const lines = [
    [nickname, name].filter(Boolean).join(" — "),
    [`Foto de ${info.date}`, grower && `cultivada por ${grower}`].filter(Boolean).join(" · "),
    caption && `“${caption}”`,
  ].filter((l): l is string => !!l);
  return `${lines.join("\n")}\n\n${SHARE_SLOGAN} ${SHARE_SITE}`;
}

/** Nome do arquivo compartilhado: "aurora-14-x-2026.jpg" (sem acento, espaço nem ponto). */
export function shareFileName(nickname: string, date: string): string {
  const slug = (s: string) =>
    normalizeSearch(s)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  const base = [slug(nickname), slug(date)].filter(Boolean).join("-") || "orchidiary";
  return `${base}.jpg`;
}
