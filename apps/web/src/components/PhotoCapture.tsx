import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { api, type LocationCheck, type Photo } from "../lib/api.ts";
import { getPosition, type Position } from "../lib/geo.ts";
import { Button, Icon } from "./ui.tsx";

export type PhotoSource = "camera" | "upload";

/**
 * Envia a foto para a planta. Da câmera vão data e GPS do momento (o `position`
 * dado, ou o do aparelho agora); da galeria a API lê data e GPS do EXIF.
 */
export async function uploadPhoto(
  plantId: string,
  file: File,
  source: PhotoSource,
  opts: { takenAt?: Date; position?: Position | null } = {},
): Promise<{ photo: Photo; locationCheck: LocationCheck | null }> {
  const form = new FormData();
  form.set("file", file);
  form.set("source", source);
  if (source === "camera") {
    form.set("takenAt", (opts.takenAt ?? new Date()).toISOString());
    const pos = opts.position === undefined ? await getPosition() : opts.position;
    if (pos) {
      form.set("lat", String(pos.lat));
      form.set("lng", String(pos.lng));
      form.set("accuracy", String(pos.accuracy));
    }
  }
  return api.post(`/plants/${plantId}/photos`, form);
}

interface Props {
  plantId: string;
  onSaved: (result: { photo: Photo; locationCheck: LocationCheck | null }) => void;
  /** Aparência do botão, para ele entrar no grupo de ações de quem o usa. */
  className?: string;
  /** Botão redondo fixo no canto, acima da barra de navegação, que acompanha o scroll. */
  floating?: boolean;
}

/**
 * Uma entrada só para a foto: sem `capture`, o aparelho oferece tirar a foto
 * na hora, escolher da galeria ou dos arquivos. Renderiza um fragmento (botão
 * e, quando há, avisos em linha própria) para caber num grupo `flex-wrap`.
 * A API lê data e GPS do EXIF da foto, se houver.
 */
export function PhotoCapture({ plantId, onSaved, className = "", floating = false }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      onSaved(await uploadPhoto(plantId, file, "upload"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao enviar a foto.");
    } finally {
      setBusy(false);
    }
  }

  if (floating) {
    return (
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5.9rem+env(safe-area-inset-bottom))] z-10 px-4">
        <div className="mx-auto flex max-w-2xl flex-col items-end gap-2">
          {error && (
            <p role="alert" className="pointer-events-auto max-w-xs rounded-lg border border-linha bg-folha px-3 py-2 text-[0.85rem] text-alerta shadow-caderno">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            aria-label={busy ? "Enviando foto…" : "Fotografar"}
            title="Fotografar"
            className="pointer-events-auto inline-flex size-14 items-center justify-center rounded-full bg-tinta text-folha shadow-caderno active:bg-tinta-viva disabled:opacity-60"
          >
            <Icon name="camera" className={`size-6 ${busy ? "animate-pulse" : ""}`} />
          </button>
          <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => void send(e)} />
        </div>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className={`inline-flex items-center gap-2 disabled:opacity-45 ${className}`}
      >
        <Icon name="camera" className="size-4" />
        {busy ? "Enviando foto…" : "Fotografar"}
      </button>
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => void send(e)} />
      {error && <p className="w-full text-alerta">{error}</p>}
    </>
  );
}

export interface PickedPhoto {
  file: File;
  source: PhotoSource;
  takenAt: Date;
}

/** Escolhe a foto antes de a planta existir (o envio fica para depois de salvar). */
export function PhotoPicker({ value, onChange }: { value: PickedPhoto | null; onChange: (v: PickedPhoto | null) => void }) {
  const [preview, setPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!value) return setPreview(null);
    const url = URL.createObjectURL(value.file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);

  function pick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) onChange({ file, source: "upload", takenAt: new Date() });
  }

  return (
    <div className="space-y-2">
      {preview && (
        <div className="fixada flex h-48 items-center justify-center overflow-hidden rounded-lg border border-linha">
          <img src={preview} alt="Foto de capa escolhida" className="h-full w-full object-cover" />
        </div>
      )}
      {/* Sem `capture`: o aparelho oferece tirar a foto, a galeria ou os arquivos */}
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={pick} />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex w-full items-center gap-3 rounded-lg border border-dashed border-contorno bg-folha px-4 py-4 text-left"
      >
        <Icon name="camera" className="size-8 text-orquidea" />
        <span>
          <span className="block font-medium">{value ? "Trocar a foto" : "Foto da planta"}</span>
          <span className="block text-[0.95rem] text-musgo">Toque para tirar uma foto ou escolher da galeria</span>
        </span>
      </button>
      {value && (
        <Button type="button" variant="quiet" onClick={() => onChange(null)} className="w-full">
          Remover foto
        </Button>
      )}
    </div>
  );
}
