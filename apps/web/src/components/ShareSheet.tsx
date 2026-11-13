import { shareCaption, shareFileName } from "@orchidiary/shared";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { canShareFiles, downloadFile, shareFile } from "../lib/share.ts";
import { loadSharePhoto, renderShareImage, SHARE_VARIANTS, type ShareCardData, type ShareVariant } from "../lib/shareImage.ts";
import { useToast } from "./Toast.tsx";
import { Button, Icon, Toggle } from "./ui.tsx";

/** O que a folha precisa para compartilhar uma foto: os dados da planta e os da foto. */
export interface SharePhoto extends ShareCardData {
  /** Legenda da foto, se houver (vai só no texto) */
  caption?: string | null;
}

/** A parte que é da planta (igual para todas as fotos dela). */
export type SharePlant = Omit<SharePhoto, "date" | "caption">;

const VARIANT_KEY = "orchidiary:compartilhar-apresentacao";
const TEXT_KEY = "orchidiary:compartilhar-texto";

function readPref<T>(key: string, parse: (raw: string | null) => T): T {
  try {
    return parse(localStorage.getItem(key));
  } catch {
    return parse(null);
  }
}
function writePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // sem armazenamento (aba anônima): só não lembra
  }
}

type Rendered = { file: File; url: string };

/**
 * Folha de compartilhar a foto: escolhe a apresentação (só a foto, etiqueta, fixada ou
 * story), vê como fica e manda pela folha de compartilhamento do aparelho. A imagem é
 * gerada ao escolher, para que o toque em "Compartilhar" já tenha o arquivo pronto
 * (o navegador só abre a folha logo depois de um toque).
 */
export function ShareSheet({ src, photo, onClose }: { src: string; photo: SharePhoto; onClose: () => void }) {
  const toast = useToast();
  const [variant, setVariant] = useState<ShareVariant>(() =>
    readPref(VARIANT_KEY, (r) => (SHARE_VARIANTS.some((v) => v.id === r) ? (r as ShareVariant) : "etiqueta")),
  );
  const [withText, setWithText] = useState(() => readPref(TEXT_KEY, (r) => r !== "0"));
  const [rendered, setRendered] = useState<Partial<Record<ShareVariant, Rendered>>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const bitmap = useRef<Promise<ImageBitmap> | null>(null);
  const urls = useRef<string[]>([]);
  // a planta não muda com a folha aberta; o ref evita regerar a cada render de quem abriu
  const card = useRef(photo);
  const canShare = canShareFiles();

  const text = shareCaption({ nickname: photo.nickname, name: photo.name.map((p) => p.text).join("") || null, date: photo.date, grower: photo.grower, caption: photo.caption });
  const fileName = shareFileName(photo.nickname, photo.date);
  const current = rendered[variant];

  // Gera a apresentação escolhida (uma vez cada; trocar e voltar é instantâneo)
  useEffect(() => {
    if (rendered[variant]) return;
    let alive = true;
    setError(null);
    bitmap.current ??= loadSharePhoto(src);
    bitmap.current
      .then((bmp) => renderShareImage(bmp, variant, card.current))
      .then((blob) => {
        if (!alive) return;
        const url = URL.createObjectURL(blob);
        urls.current.push(url);
        setRendered((prev) => ({ ...prev, [variant]: { file: new File([blob], fileName, { type: "image/jpeg" }), url } }));
      })
      .catch((e: unknown) => {
        bitmap.current = null;
        if (alive) setError(e instanceof Error ? e.message : "Não foi possível preparar a imagem.");
      });
    return () => {
      alive = false;
    };
  }, [variant, rendered, src, fileName]);

  useEffect(
    () => () => {
      urls.current.forEach((u) => URL.revokeObjectURL(u));
      void bitmap.current?.then((b) => b.close(), () => {});
    },
    [],
  );

  // Esc fecha só a folha, não a foto ampliada que está embaixo
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  function choose(v: ShareVariant) {
    setVariant(v);
    writePref(VARIANT_KEY, v);
  }

  async function share() {
    if (!current) return;
    setBusy(true);
    try {
      const outcome = await shareFile(current.file, withText ? text : undefined);
      if (outcome === "downloaded") toast({ message: "Imagem baixada." });
      if (outcome === "shared") onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível compartilhar.");
    } finally {
      setBusy(false);
    }
  }

  async function copyText() {
    try {
      await navigator.clipboard.writeText(text);
      toast({ message: "Texto copiado." });
    } catch {
      setError("Não foi possível copiar o texto.");
    }
  }

  const hint = SHARE_VARIANTS.find((v) => v.id === variant)?.hint;

  return createPortal(
    <div className="fixed inset-0 z-40 flex items-end bg-[#15201a]/45" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-title"
        onClick={(e) => e.stopPropagation()}
        className="pagina mx-auto flex max-h-[calc(94dvh-env(safe-area-inset-top))] w-full max-w-xl flex-col rounded-t-2xl border border-b-0 border-linha bg-folha shadow-caderno"
      >
        <div className="overflow-y-auto overscroll-contain px-5 pt-5 pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="eyebrow">
                {photo.nickname} · {photo.date}
              </p>
              <h2 id="share-title" className="mt-1 text-[1.75rem] tracking-[-0.02em]">
                Compartilhar foto
              </h2>
            </div>
            <button type="button" onClick={onClose} aria-label="Fechar" className="grid size-11 shrink-0 place-items-center rounded-full text-musgo active:bg-salvia-clara">
              <Icon name="close" />
            </button>
          </div>

          <div role="radiogroup" aria-label="Apresentação" className="mt-4 flex flex-wrap gap-2">
            {SHARE_VARIANTS.map((v) => (
              <button
                key={v.id}
                type="button"
                role="radio"
                aria-checked={variant === v.id}
                onClick={() => choose(v.id)}
                className={`min-h-10 rounded-full border px-3.5 text-[0.86rem] transition-colors ${
                  variant === v.id ? "border-tinta bg-tinta text-folha" : "border-contorno text-tinta active:bg-salvia-clara"
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
          {hint && <p className="mt-2 text-[0.84rem] text-musgo">{hint}</p>}

          <figure className="mt-3 flex h-[min(40dvh,26rem)] items-center justify-center overflow-hidden rounded-lg border border-linha bg-salvia-clara/60 p-3">
            {current ? (
              <img src={current.url} alt="Como a imagem vai sair" className="max-h-full max-w-full rounded-[2px] object-contain shadow-sm" />
            ) : (
              <p className="typed text-[0.8rem]">{error ? "—" : "preparando a imagem…"}</p>
            )}
          </figure>

          <div className="mt-3">
            <Toggle
              checked={withText}
              onChange={(v) => {
                setWithText(v);
                writePref(TEXT_KEY, v ? "1" : "0");
              }}
            >
              <span className="text-[0.92rem]">Enviar o texto junto</span>
            </Toggle>
            {withText && (
              <p className="typed mt-1 rounded-md border border-linha bg-papel px-3 py-2.5 text-[0.76rem] leading-relaxed whitespace-pre-line">{text}</p>
            )}
            {withText && <p className="mt-1.5 text-[0.78rem] text-musgo">O Instagram ignora o texto; WhatsApp e Telegram usam como legenda.</p>}
          </div>

          {error && <p className="mt-3 text-[0.88rem] text-alerta">{error}</p>}
        </div>

        {/* As ações ficam sempre à vista, fora da rolagem */}
        <div className="border-t border-linha px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="grid gap-2">
            <Button type="button" onClick={share} disabled={!current || busy}>
              <Icon name={canShare ? "share" : "download"} className="size-[18px]" />
              {canShare ? "Compartilhar" : "Baixar imagem"}
            </Button>
            <div className="flex gap-2">
              {canShare && (
                <Button type="button" variant="quiet" className="flex-1" disabled={!current} onClick={() => current && downloadFile(current.file)}>
                  Baixar
                </Button>
              )}
              <Button type="button" variant="quiet" className="flex-1" onClick={copyText}>
                Copiar texto
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
