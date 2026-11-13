import { type NamePart, SHARE_SITE, SHARE_SLOGAN } from "@orchidiary/shared";

/**
 * Imagem da foto compartilhada, desenhada num canvas e entregue em JPEG (WebP vira
 * figurinha no WhatsApp e o Instagram nem sempre aceita). Há algumas apresentações
 * para testar; os dados vão também no texto que acompanha a foto.
 */
export type ShareVariant = "foto" | "etiqueta" | "fixada" | "story";

export const SHARE_VARIANTS: { id: ShareVariant; label: string; hint: string }[] = [
  { id: "foto", label: "Só a foto", hint: "A foto como está; os dados vão no texto." },
  { id: "etiqueta", label: "Etiqueta", hint: "A foto com a etiqueta de herbário embaixo." },
  { id: "fixada", label: "Fixada", hint: "Presa com fita na página do caderno, 4:5 para o feed." },
  { id: "story", label: "Story", hint: "Vertical 9:16, para Status e Stories." },
];

/** O que aparece escrito na imagem; nomes já resolvidos, data já no formato de etiqueta. */
export interface ShareCardData {
  nickname: string;
  /** Táxon ou fórmula da cruza, com o itálico de cada parte; vazio quando não determinada */
  name: NamePart[];
  /** "Tombo nº 0007" */
  accession: string;
  /** "14.X.2026" */
  date: string;
  grower: string | null;
}

// Cores fixas do tema claro: a imagem sai igual qualquer que seja o tema do aparelho
const C = {
  papel: "#f7f5ec",
  folha: "#fcfaf4",
  tinta: "#254d3d",
  musgo: "#66725f",
  folhagem: "#6f7f5f",
  linha: "#dedfd2",
  orquidea: "#765f82",
  fita: "#d9d0abb3",
  sombra: "#273f2f40",
  logo: { aro: "#8aa286", mostrador: "#2c5a45", flor: "#c27f9c", papel: "#f7f5ec", broto: "#bcd3a0" },
};

const SERIF = "Gelasio, Georgia, serif";
const MONO = '"IBM Plex Mono", ui-monospace, Consolas, monospace';
const HAND = '"Orchidiary Mao", "La Belle Aurore", cursive';

const MAX_PHOTO_SIDE = 2048;

// ─── Fontes e foto ───────────────────────────────────────────────────────────

let fontsReady: Promise<unknown> | null = null;

/** Gelasio e Plex vêm do Google Fonts (já declaradas); a letra manuscrita completa é nossa. */
function loadFonts() {
  fontsReady ??= Promise.allSettled([
    new FontFace("Orchidiary Mao", "url(/fonts/la-belle-aurore.woff2)").load().then((f) => document.fonts.add(f)),
    document.fonts.load(`400 40px ${SERIF}`),
    document.fonts.load(`italic 400 40px ${SERIF}`),
    document.fonts.load(`500 40px ${SERIF}`),
    document.fonts.load(`400 20px ${MONO}`),
  ]);
  return fontsReady;
}

/** Baixa a foto (a rota exige a sessão) e decodifica para desenhar. */
export async function loadSharePhoto(src: string): Promise<ImageBitmap> {
  const res = await fetch(src, { credentials: "same-origin" });
  if (!res.ok) throw new Error("Não foi possível baixar a foto.");
  return createImageBitmap(await res.blob());
}

// ─── Texto ───────────────────────────────────────────────────────────────────

type Ctx = CanvasRenderingContext2D;
type Align = "left" | "center" | "right";

interface TextStyle {
  size: number;
  /** Encolhe até aqui antes de aceitar mais linhas que o máximo */
  minSize?: number;
  maxLines?: number;
  family?: string;
  weight?: number;
  color: string;
  lineHeight?: number;
  /** Espaçamento entre letras, em px (rótulos em caixa-alta) */
  spacing?: number;
}

type Line = { runs: NamePart[]; width: number };

const fontOf = (size: number, italic: boolean, s: TextStyle) =>
  `${italic ? "italic " : ""}${s.weight ?? 400} ${size}px ${s.family ?? SERIF}`;

function setFont(ctx: Ctx, size: number, italic: boolean, s: TextStyle) {
  ctx.font = fontOf(size, italic, s);
  // letterSpacing ainda não existe em todo navegador; sem ele, o texto só fica mais junto
  if ("letterSpacing" in ctx) (ctx as Ctx & { letterSpacing: string }).letterSpacing = `${s.spacing ?? 0}px`;
}

/** Quebra as partes (cada uma com seu itálico) em linhas que caibam na largura. */
function wrap(ctx: Ctx, parts: NamePart[], size: number, maxWidth: number, s: TextStyle): Line[] {
  const tokens = parts.flatMap((p) => p.text.split(/(\s+)/).filter(Boolean).map((text) => ({ text, italic: p.italic })));
  const lines: Line[] = [];
  let line: Line = { runs: [], width: 0 };
  const push = () => {
    while (line.runs.length && !line.runs.at(-1)!.text.trim()) {
      const last = line.runs.pop()!;
      setFont(ctx, size, last.italic, s);
      line.width -= ctx.measureText(last.text).width;
    }
    if (line.runs.length) lines.push(line);
    line = { runs: [], width: 0 };
  };
  for (const t of tokens) {
    const blank = !t.text.trim();
    if (blank && !line.runs.length) continue;
    setFont(ctx, size, t.italic, s);
    const w = ctx.measureText(blank ? " " : t.text).width;
    if (!blank && line.runs.length && line.width + w > maxWidth) push();
    line.runs.push({ text: blank ? " " : t.text, italic: t.italic });
    line.width += w;
  }
  push();
  return lines;
}

/** Bloco de texto já medido: altura conhecida, desenha a partir do topo. */
interface Block {
  h: number;
  draw: (ctx: Ctx, top: number) => void;
}

function textBlock(ctx: Ctx, parts: NamePart[], x: number, maxWidth: number, align: Align, s: TextStyle): Block {
  const maxLines = s.maxLines ?? 1;
  let size = s.size;
  let lines = wrap(ctx, parts, size, maxWidth, s);
  while (size > (s.minSize ?? s.size) && (lines.length > maxLines || lines.some((l) => l.width > maxWidth))) {
    size = Math.max(s.minSize ?? s.size, size * 0.94);
    lines = wrap(ctx, parts, size, maxWidth, s);
  }
  if (lines.length > maxLines) {
    // ainda não coube: corta e fecha com reticências
    lines = lines.slice(0, maxLines);
    const last = lines.at(-1)!;
    last.runs.push({ text: "…", italic: last.runs.at(-1)?.italic ?? false });
  }
  const lh = size * (s.lineHeight ?? 1.25);
  return {
    h: lines.length ? lh * (lines.length - 1) + size * 1.15 : 0,
    draw(c, top) {
      c.fillStyle = s.color;
      c.textBaseline = "alphabetic";
      c.textAlign = "left";
      lines.forEach((line, i) => {
        let width = 0;
        for (const r of line.runs) {
          setFont(c, size, r.italic, s);
          width += c.measureText(r.text).width;
        }
        let cx = align === "left" ? x : align === "center" ? x - width / 2 : x - width;
        const baseline = top + size * 0.9 + i * lh;
        for (const r of line.runs) {
          setFont(c, size, r.italic, s);
          c.fillText(r.text, cx, baseline);
          cx += c.measureText(r.text).width;
        }
      });
      setFont(c, size, false, { ...s, spacing: 0 });
    },
  };
}

const plain = (text: string, italic = false): NamePart[] => [{ text, italic }];

/** Empilha blocos com os espaços dados entre eles (gaps[i] vem antes do bloco i+1). */
function stack(blocks: (Block | null)[], gap: number | number[]): Block {
  const list = blocks.filter((b): b is Block => !!b && b.h > 0);
  const gapAt = (i: number) => (Array.isArray(gap) ? (gap[i] ?? gap.at(-1) ?? 0) : gap);
  const h = list.reduce((sum, b, i) => sum + b.h + (i ? gapAt(i - 1) : 0), 0);
  return {
    h,
    draw(ctx, top) {
      let y = top;
      list.forEach((b, i) => {
        if (i) y += gapAt(i - 1);
        b.draw(ctx, y);
        y += b.h;
      });
    },
  };
}

// ─── Logo e assinatura ───────────────────────────────────────────────────────

const LEAF = "M0 0C13 -11 31 -11 44 0C31 11 13 11 0 0Z";
const SPROUT = "M0 0C7 -7 15 -7 22 0C15 7 7 7 0 0Z";
const DEG = Math.PI / 180;

/** O Relógio, como em public/icon.svg (sem o quadrado de fundo). */
function drawLogo(ctx: Ctx, cx: number, cy: number, size: number, bg: string) {
  const leaf = new Path2D(LEAF);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(size / 74, size / 74);
  ctx.beginPath();
  ctx.arc(0, 0, 35.5, 0, Math.PI * 2);
  ctx.strokeStyle = C.logo.aro;
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, 30, 0, Math.PI * 2);
  ctx.fillStyle = C.logo.mostrador;
  ctx.fill();
  ctx.save();
  ctx.rotate(-55 * DEG);
  ctx.fillStyle = C.logo.flor;
  ctx.fill(leaf);
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, 30, 0, Math.PI * 2);
  ctx.clip();
  ctx.rotate(-55 * DEG);
  ctx.fillStyle = C.logo.papel;
  ctx.fill(leaf);
  ctx.restore();
  ctx.save();
  ctx.rotate(200 * DEG);
  ctx.fillStyle = C.logo.broto;
  ctx.fill(new Path2D(SPROUT));
  ctx.restore();
  ctx.beginPath();
  ctx.arc(0, 0, 2.6, 0, Math.PI * 2);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.restore();
}

/** Logo + orchidiary.com, numa linha só. */
function siteBlock(ctx: Ctx, x: number, align: Align, u: number, bg: string): Block {
  const logo = 40 * u;
  const gap = 12 * u;
  const style: TextStyle = { size: 22 * u, family: MONO, color: C.musgo, spacing: 1.5 * u };
  setFont(ctx, style.size, false, style);
  const textW = ctx.measureText(SHARE_SITE).width;
  const width = logo + gap + textW;
  const left = align === "left" ? x : align === "center" ? x - width / 2 : x - width;
  const text = textBlock(ctx, plain(SHARE_SITE), left + logo + gap, textW + 4 * u, "left", style);
  return {
    h: logo,
    draw(c, top) {
      drawLogo(c, left + logo / 2, top + logo / 2, logo, bg);
      text.draw(c, top + (logo - text.h) / 2);
    },
  };
}

const sloganBlock = (ctx: Ctx, x: number, maxWidth: number, align: Align, size: number) =>
  textBlock(ctx, plain(SHARE_SLOGAN), x, maxWidth, align, { size, family: HAND, color: C.tinta });

const growerBlock = (ctx: Ctx, grower: string | null, x: number, maxWidth: number, align: Align, size: number) =>
  grower
    ? textBlock(ctx, plain(`cultivada por ${grower}`), x, maxWidth, align, { size, minSize: size * 0.7, family: HAND, color: C.orquidea })
    : null;

const nameBlock = (ctx: Ctx, name: NamePart[], x: number, maxWidth: number, align: Align, size: number) =>
  name.length
    ? textBlock(ctx, name, x, maxWidth, align, { size, minSize: size * 0.75, maxLines: 3, color: C.folhagem, lineHeight: 1.3 })
    : null;

// ─── Foto presa com fita ─────────────────────────────────────────────────────

/** Tamanho da foto (contida) e da moldura branca em volta dela. */
function pinnedSize(photo: ImageBitmap, maxW: number, maxH: number, border: number) {
  const ratio = photo.width / photo.height;
  const w = Math.min(maxW - border * 2, (maxH - border * 2) * ratio);
  const h = w / ratio;
  return { w, h, frameW: w + border * 2, frameH: h + border * 2 };
}

function drawPinned(ctx: Ctx, photo: ImageBitmap, cx: number, cy: number, size: ReturnType<typeof pinnedSize>, u: number, angle: number) {
  const { w, h, frameW, frameH } = size;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle * DEG);
  ctx.shadowColor = C.sombra;
  ctx.shadowBlur = 40 * u;
  ctx.shadowOffsetY = 14 * u;
  ctx.fillStyle = C.folha;
  ctx.fillRect(-frameW / 2, -frameH / 2, frameW, frameH);
  ctx.shadowColor = "transparent";
  ctx.drawImage(photo, -w / 2, -h / 2, w, h);
  ctx.strokeStyle = C.linha;
  ctx.lineWidth = 1.5 * u;
  ctx.strokeRect(-frameW / 2, -frameH / 2, frameW, frameH);
  // fita de papel no alto, meio torta
  ctx.translate(0, -frameH / 2);
  ctx.rotate(3.5 * DEG);
  ctx.fillStyle = C.fita;
  ctx.fillRect(-95 * u, -24 * u, 190 * u, 48 * u);
  ctx.restore();
}

/** Página do caderno: papel com pauta bem clara. */
function drawPage(ctx: Ctx, W: number, H: number, u: number) {
  ctx.fillStyle = C.papel;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#dedfd280";
  ctx.lineWidth = 1.5 * u;
  for (let y = 64 * u; y < H; y += 64 * u) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
}

// ─── Apresentações ───────────────────────────────────────────────────────────

function canvasOf(w: number, h: number) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w);
  canvas.height = Math.round(h);
  return { canvas, ctx: canvas.getContext("2d")! };
}

/** Contexto só para medir texto antes de saber o tamanho final da imagem. */
const measurer = () => canvasOf(1, 1).ctx;

function renderFoto(photo: ImageBitmap) {
  const scale = Math.min(1, MAX_PHOTO_SIDE / Math.max(photo.width, photo.height));
  const { canvas, ctx } = canvasOf(photo.width * scale, photo.height * scale);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(photo, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** A foto inteira em cima e a etiqueta de herbário embaixo. */
function renderEtiqueta(photo: ImageBitmap, card: ShareCardData) {
  const W = Math.min(1440, Math.max(1080, photo.width));
  const u = W / 1080;
  const ph = Math.round((W * photo.height) / photo.width);
  const pad = 64 * u;
  const inner = W - pad * 2;
  const m = measurer();

  const eyebrow = textBlock(m, plain(`${card.accession} · ${card.date}`.toUpperCase()), pad, inner, "left", {
    size: 22 * u,
    family: MONO,
    color: C.musgo,
    spacing: 3 * u,
  });
  const nickname = textBlock(m, plain(card.nickname), pad, inner, "left", { size: 64 * u, minSize: 44 * u, maxLines: 2, weight: 500, color: C.tinta, lineHeight: 1.1 });
  const name = nameBlock(m, card.name, pad, inner, "left", 38 * u);
  const grower = growerBlock(m, card.grower, pad, inner, "left", 44 * u);
  const site = siteBlock(m, pad, "left", u, C.folha);
  const slogan = sloganBlock(m, W - pad, inner / 2, "right", 36 * u);
  const body = stack([eyebrow, nickname, name, grower], [22 * u, 12 * u, 26 * u]);
  const footerH = Math.max(site.h, slogan.h);
  const labelH = pad + body.h + 44 * u + footerH + pad * 0.8;

  const { canvas, ctx } = canvasOf(W, ph + labelH);
  ctx.fillStyle = C.folha;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(photo, 0, 0, W, ph);
  ctx.fillStyle = C.linha;
  ctx.fillRect(0, ph, W, 2 * u);
  body.draw(ctx, ph + pad);
  const footerTop = ph + pad + body.h + 44 * u;
  // pontilhado de etiqueta separando a assinatura
  ctx.strokeStyle = C.linha;
  ctx.lineWidth = 2 * u;
  ctx.setLineDash([2 * u, 8 * u]);
  ctx.beginPath();
  ctx.moveTo(pad, footerTop - 22 * u);
  ctx.lineTo(W - pad, footerTop - 22 * u);
  ctx.stroke();
  ctx.setLineDash([]);
  site.draw(ctx, footerTop + (footerH - site.h) / 2);
  slogan.draw(ctx, footerTop + (footerH - slogan.h) / 2);
  return canvas;
}

/** Foto presa com fita numa página do caderno, com a anotação à mão embaixo (4:5). */
function renderFixada(photo: ImageBitmap, card: ShareCardData) {
  const W = 1080;
  const H = 1350;
  const u = 1;
  const pad = 72;
  const inner = W - pad * 2;
  const m = measurer();

  const title = textBlock(m, plain(`${card.nickname} · ${card.date}`), W / 2, inner, "center", { size: 60, minSize: 40, family: HAND, color: C.tinta });
  const name = nameBlock(m, card.name, W / 2, inner, "center", 34);
  const grower = growerBlock(m, card.grower, W / 2, inner, "center", 40);
  const text = stack([title, name, grower], [10, 18]);
  const site = siteBlock(m, pad, "left", u, C.papel);
  const slogan = sloganBlock(m, W - pad, inner / 2, "right", 34);
  const footerH = Math.max(site.h, slogan.h);
  const footerTop = H - 56 - footerH;

  const areaTop = 90;
  const areaBottom = footerTop - 48;
  const gap = 56;
  const size = pinnedSize(photo, 880, areaBottom - areaTop - text.h - gap, 22);
  const groupH = size.frameH + gap + text.h;
  const top = areaTop + (areaBottom - areaTop - groupH) / 2;

  const { canvas, ctx } = canvasOf(W, H);
  drawPage(ctx, W, H, u);
  drawPinned(ctx, photo, W / 2, top + size.frameH / 2, size, u, -1.5);
  text.draw(ctx, top + size.frameH + gap);
  site.draw(ctx, footerTop + (footerH - site.h) / 2);
  slogan.draw(ctx, footerTop + (footerH - slogan.h) / 2);
  return canvas;
}

/** Vertical 9:16: cabeçalho de exsicata, a foto presa e a assinatura (Status e Stories). */
function renderStory(photo: ImageBitmap, card: ShareCardData) {
  const W = 1080;
  const H = 1920;
  const u = 1;
  const pad = 90;
  const inner = W - pad * 2;
  // faixas que o Instagram e o WhatsApp cobrem com a interface deles
  const safeTop = 230;
  const safeBottom = H - 230;
  const m = measurer();

  const eyebrow = textBlock(m, plain(card.accession.toUpperCase()), W / 2, inner, "center", { size: 24, family: MONO, color: C.musgo, spacing: 4 });
  const nickname = textBlock(m, plain(card.nickname), W / 2, inner, "center", { size: 80, minSize: 52, maxLines: 2, weight: 500, color: C.tinta, lineHeight: 1.1 });
  const name = nameBlock(m, card.name, W / 2, inner, "center", 40);
  const head = stack([eyebrow, nickname, name], [18, 14]);

  const date = textBlock(m, plain(card.date), W / 2, inner, "center", { size: 26, family: MONO, color: C.musgo, spacing: 2 });
  const grower = growerBlock(m, card.grower, W / 2, inner, "center", 50);
  const notes = stack([grower, date], 10);
  const slogan = sloganBlock(m, W / 2, inner, "center", 52);
  const site = siteBlock(m, W / 2, "center", u, C.papel);
  const foot = stack([slogan, site], 18);

  const photoTop = safeTop + head.h + 70;
  const photoBottom = safeBottom - foot.h - 60 - notes.h - 60;
  const size = pinnedSize(photo, 900, photoBottom - photoTop, 24);

  const { canvas, ctx } = canvasOf(W, H);
  drawPage(ctx, W, H, u);
  head.draw(ctx, safeTop);
  const cy = photoTop + (photoBottom - photoTop) / 2;
  drawPinned(ctx, photo, W / 2, cy, size, u, -1);
  notes.draw(ctx, cy + size.frameH / 2 + 60);
  foot.draw(ctx, safeBottom - foot.h);
  return canvas;
}

/** Desenha a apresentação escolhida e devolve o JPEG. */
export async function renderShareImage(photo: ImageBitmap, variant: ShareVariant, card: ShareCardData): Promise<Blob> {
  if (variant !== "foto") await loadFonts();
  const canvas =
    variant === "etiqueta"
      ? renderEtiqueta(photo, card)
      : variant === "fixada"
        ? renderFixada(photo, card)
        : variant === "story"
          ? renderStory(photo, card)
          : renderFoto(photo);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Não foi possível gerar a imagem."))), "image/jpeg", 0.9),
  );
}
