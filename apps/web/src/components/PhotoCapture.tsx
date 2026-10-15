import { type ChangeEvent, useRef, useState } from "react";
import { api, type LocationCheck, type Photo } from "../lib/api.ts";
import { getPosition } from "../lib/geo.ts";
import { Button } from "./ui.tsx";

interface Props {
  plantId: string;
  onSaved: (result: { photo: Photo; locationCheck: LocationCheck | null }) => void;
}

/**
 * Duas entradas: câmera (captura direta, com GPS do aparelho) e galeria
 * (upload; a API lê data e GPS do EXIF da foto, se houver).
 */
export function PhotoCapture({ plantId, onSaved }: Props) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send(file: File, source: "camera" | "upload") {
    setError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("source", source);
      if (source === "camera") {
        setBusy("Anotando a localização…");
        form.set("takenAt", new Date().toISOString());
        const pos = await getPosition();
        if (pos) {
          form.set("lat", String(pos.lat));
          form.set("lng", String(pos.lng));
          form.set("accuracy", String(pos.accuracy));
        }
      }
      setBusy("Enviando foto…");
      onSaved(await api.post(`/plants/${plantId}/photos`, form));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao enviar a foto.");
    } finally {
      setBusy(null);
    }
  }

  const pick = (source: "camera" | "upload") => (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void send(file, source);
  };

  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        <Button onClick={() => cameraRef.current?.click()} disabled={!!busy}>
          Fotografar
        </Button>
        <Button variant="quiet" onClick={() => galleryRef.current?.click()} disabled={!!busy}>
          Da galeria
        </Button>
      </div>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={pick("camera")} />
      <input ref={galleryRef} type="file" accept="image/*" hidden onChange={pick("upload")} />
      {busy && <p className="typed mt-2 text-[0.85rem]">{busy}</p>}
      {error && <p className="mt-2 text-alerta">{error}</p>}
    </div>
  );
}
