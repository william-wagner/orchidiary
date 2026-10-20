import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api, illustrationUrl, type LocationCheck, type Photo, photoUrl, type Plant } from "../lib/api.ts";
import { coverOf, plateOf } from "../lib/cover.ts";
import { typedDate } from "../lib/format.ts";
import { PhotoCapture } from "./PhotoCapture.tsx";
import { useToast } from "./Toast.tsx";
import { ErrorText, Icon } from "./ui.tsx";

/**
 * Painel para trocar a foto de capa: a pré-visualização de como a ficha vai ficar,
 * o mesmo botão de fotografar do diário e a grade das fotos da planta.
 * Uma foto nova entra no diário na hora (como qualquer outra) e fica escolhida;
 * a capa só muda ao tocar em "Usar como capa", e o aviso oferece "Desfazer".
 */
export function CoverSheet({
  plant,
  photos,
  onClose,
  onUploaded,
}: {
  plant: Plant;
  photos: Photo[];
  onClose: () => void;
  /** Quem abriu o painel decide o que fazer com a checagem de local da foto nova */
  onUploaded?: (result: { photo: Photo; locationCheck: LocationCheck | null }) => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const current = coverOf(plant, photos);
  const [selected, setSelected] = useState<string | null>(current?.id ?? null);
  /** Fotos enviadas com este painel aberto: ficam no começo da grade, com a etiqueta "Nova" */
  const [added, setAdded] = useState<string[]>([]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["timeline", plant.id] });
    qc.invalidateQueries({ queryKey: ["plants"] });
  };

  const previous = plant.coverPhotoId;
  const patchCover = (coverPhotoId: string | null) => api.patch<Plant>(`/plants/${plant.id}`, { coverPhotoId });

  const save = useMutation({
    mutationFn: () => patchCover(selected),
    onSuccess: () => {
      refresh();
      // a API marca a prancha como "pendente" logo depois de responder; a segunda conferência pega isso
      setTimeout(refresh, 2500);
      onClose();
      toast({
        message: "Capa trocada.",
        duration: 8000,
        actions: [
          {
            label: "Desfazer",
            run: () =>
              patchCover(previous)
                .then(() => toast({ message: "Capa anterior restaurada." }))
                .catch((e: unknown) => toast({ message: e instanceof Error ? e.message : "Não foi possível desfazer." }))
                .finally(refresh),
          },
        ],
      });
    },
  });

  const chosen = photos.find((p) => p.id === selected);
  const plate = plateOf(chosen);
  const isNew = selected !== null && added.includes(selected);
  const same = selected === (current?.id ?? null);
  const drawing = chosen?.illustrationStatus === "pending";

  const ordered = [...added.flatMap((id) => photos.filter((p) => p.id === id)), ...photos.filter((p) => !added.includes(p.id))];

  const tag = isNew
    ? { text: "Foto nova", cls: "selo-flor" }
    : plate
      ? { text: "Prancha pronta", cls: "" }
      : { text: drawing ? "Desenhando a prancha" : "Prancha a desenhar", cls: "selo-ocre" };

  const hint = same
    ? "Esta é a capa de agora. Escolha outra foto para trocar."
    : plate
      ? "Esta foto já tem prancha pronta. A troca é imediata."
      : `${isNew ? "A foto já entrou no diário da planta. " : ""}A ficha mostra a foto até a prancha botânica ficar pronta, o que leva alguns minutos.`;

  return (
    <div className="fixed inset-0 z-20 flex items-end bg-[#24382a]/40 backdrop-blur-[3px]" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cover-title"
        onClick={(e) => e.stopPropagation()}
        className="pagina mx-auto flex max-h-[calc(92dvh-env(safe-area-inset-top))] w-full max-w-2xl flex-col rounded-t-2xl border border-b-0 border-linha bg-folha shadow-caderno"
      >
        <div className="overflow-y-auto overscroll-contain px-5 pt-5 pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="eyebrow">{plant.nickname}</p>
              <h2 id="cover-title" className="mt-1 text-[1.75rem] tracking-[-0.02em]">
                Foto de capa
              </h2>
            </div>
            <button type="button" onClick={onClose} aria-label="Fechar" className="grid size-11 shrink-0 place-items-center rounded-full text-musgo active:bg-salvia-clara">
              <Icon name="close" />
            </button>
          </div>

          {selected && (
            <figure className="mt-4">
              <figcaption className="eyebrow mb-2">Como vai ficar na ficha</figcaption>
              <div className={`relative flex h-40 items-center justify-center overflow-hidden rounded-lg border border-linha ${plate ? "bg-prancha" : "bg-salvia-clara/60"}`}>
                <img
                  src={plate ? illustrationUrl(selected, plate) : photoUrl(selected, "thumb")}
                  alt="Pré-visualização da capa"
                  className={`h-full w-full ${plate ? "object-contain" : "object-cover"}`}
                />
                <span className={`selo ${tag.cls} absolute top-2 left-2 bg-folha`}>{tag.text}</span>
              </div>
            </figure>
          )}

          <div className="mt-4 flex flex-wrap">
            <PhotoCapture
              plantId={plant.id}
              className="min-h-12 w-full justify-center rounded-lg bg-tinta px-3 text-[0.9rem] text-folha active:bg-tinta-viva"
              onSaved={(result) => {
                refresh();
                setAdded((prev) => [result.photo.id, ...prev]);
                setSelected(result.photo.id);
                onUploaded?.(result);
              }}
            />
          </div>

          <section className="mt-5" aria-label="Fotos da planta">
            <div className="flex items-baseline justify-between gap-3 border-b border-linha pb-2">
              <p className="eyebrow">Do diário desta planta</p>
              <span className="typed text-[0.72rem]">
                {photos.length} {photos.length === 1 ? "foto" : "fotos"}
              </span>
            </div>
            {photos.length === 0 ? (
              <p className="mt-3 text-[0.85rem] text-musgo">Ainda não há fotos. Fotografe a planta para escolher a capa.</p>
            ) : (
              <>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {ordered.map((p) => {
                    const on = selected === p.id;
                    const ready = !!plateOf(p);
                    const isCover = p.id === current?.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSelected(p.id)}
                        aria-pressed={on}
                        aria-label={`Foto de ${typedDate(p.takenAt)}${isCover ? ", capa atual" : ""}${ready ? ", com prancha pronta" : ""}`}
                        className={`relative aspect-square overflow-hidden rounded-lg border bg-salvia-clara ${on ? "border-tinta ring-2 ring-tinta" : "border-linha"}`}
                      >
                        <img src={photoUrl(p.id, "thumb")} alt="" loading="lazy" className="h-full w-full object-cover" />
                        {(isCover || added.includes(p.id)) && (
                          <span
                            className={`absolute top-1.5 left-1.5 rounded-full px-2 py-0.5 text-[0.66rem] font-medium ${isCover ? "bg-folha text-tinta" : "bg-lilas text-orquidea"}`}
                          >
                            {isCover ? "Capa" : "Nova"}
                          </span>
                        )}
                        {on && (
                          <span className="absolute top-1.5 right-1.5 grid size-[22px] place-items-center rounded-full bg-tinta text-folha">
                            <Icon name="check" className="size-3.5" />
                          </span>
                        )}
                        {ready && (
                          <span className="absolute right-1.5 bottom-1.5 grid size-[22px] place-items-center rounded-full bg-folha text-folhagem">
                            <Icon name="leaf" className="size-3.5" />
                          </span>
                        )}
                        <span className="typed absolute inset-x-0 bottom-0 bg-linear-to-t from-black/55 to-transparent px-1.5 pt-4 pb-1 text-left text-[0.64rem] text-white">
                          {typedDate(p.takenAt)}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-3 flex items-center gap-2 text-[0.8rem] text-musgo">
                  <span className="grid size-5 shrink-0 place-items-center rounded-full border border-linha bg-folha text-folhagem">
                    <Icon name="leaf" className="size-3" />
                  </span>
                  Já tem prancha botânica pronta
                </p>
              </>
            )}
          </section>
        </div>

        <div className="space-y-2 border-t border-linha px-5 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <ErrorText error={save.error} />
          {selected && <p className="text-[0.8rem] leading-snug text-musgo">{hint}</p>}
          <button
            type="button"
            disabled={save.isPending || same || !selected}
            onClick={() => save.mutate()}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-tinta px-5 text-[0.95rem] font-medium text-folha transition-colors active:bg-tinta-viva disabled:opacity-45"
          >
            {save.isPending ? "Salvando…" : save.isError ? "Tentar de novo" : same ? "Esta já é a capa" : "Usar como capa"}
          </button>
        </div>
      </div>
    </div>
  );
}
