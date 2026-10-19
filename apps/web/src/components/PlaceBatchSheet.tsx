import {
  type BatchEventType,
  batchDefaults,
  type BatchSkipReason,
  exclusionsToRemember,
  formatAccession,
  joinsBatch,
  toLocalDate,
} from "@orchidiary/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { api, type BatchContext, type BatchCreated, type CollectionPlant, illustrationUrl, photoUrl } from "../lib/api.ts";
import { LOCAL_TZ, typedDate } from "../lib/format.ts";
import { PlantTaxon } from "./Taxon.tsx";
import { useToast } from "./Toast.tsx";
import { ErrorText, Field, Icon, type IconName, Input, PressedOrchid, Select } from "./ui.tsx";

export type BatchAction = BatchEventType | "reading";

const ACTIONS: Record<BatchAction, { label: string; noun: string; done: string; saved: string; icon: IconName; placeholder?: string }> = {
  watering: { label: "Rega", noun: "rega", done: "regada", saved: "Rega registrada", icon: "drop", placeholder: "Ex.: água de chuva, imersão de 10 min" },
  fertilizing: { label: "Adubação", noun: "adubação", done: "adubada", saved: "Adubação registrada", icon: "sprout", placeholder: "Ex.: NPK 20-20-20, 1 g/L" },
  treatment: { label: "Tratamento", noun: "tratamento", done: "tratada", saved: "Tratamento registrado", icon: "shield", placeholder: "Ex.: óleo de neem 5 ml/L, contra cochonilha" },
  note: { label: "Nota", noun: "nota", done: "com nota", saved: "Nota registrada", icon: "note", placeholder: "Ex.: granizo à tarde, folhas marcadas" },
  reading: { label: "Medição", noun: "medição", done: "medida", saved: "Medição registrada", icon: "thermometer" },
};
const ACTION_ORDER: BatchAction[] = ["watering", "fertilizing", "treatment", "note", "reading"];

type When = "now" | "morning" | "yesterday";
const WHEN_LABEL: Record<When, string> = { now: "Agora", morning: "Hoje de manhã", yesterday: "Ontem à tarde" };

/** Instante de cada opção de "Quando", no relógio do aparelho. */
function instantOf(when: When): Date {
  const d = new Date();
  if (when === "now") return d;
  if (when === "morning") {
    const morning = new Date(d);
    morning.setHours(8, 0, 0, 0);
    return morning < d ? morning : d;
  }
  d.setDate(d.getDate() - 1);
  d.setHours(18, 0, 0, 0);
  return d;
}

const hour = (d: Date) => d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

function dayLabel(d: Date) {
  const day = toLocalDate(d, LOCAL_TZ);
  const today = toLocalDate(new Date(), LOCAL_TZ);
  if (day === today) return "hoje";
  if (day === toLocalDate(new Date(Date.now() - 86_400_000), LOCAL_TZ)) return "ontem";
  return `em ${typedDate(d)}`;
}

function reasonText(reason: BatchSkipReason, action: BatchAction) {
  const a = ACTIONS[action];
  return reason.kind === "duplicate" ? `já ${a.done} ${dayLabel(reason.at)} às ${hour(reason.at)}` : `ficou fora da última ${a.noun}`;
}

const chip =
  "inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 text-[0.85rem] transition-colors disabled:opacity-45";

/**
 * Folha de lote: a mesma ação para as plantas que estão num lugar, de uma vez.
 * A lista já é a prévia (todas marcadas; excluir é desmarcar) e o botão diz o que vai acontecer.
 * Duplicados do dia e as exclusões do último lote vêm desmarcados. A medição é do lugar,
 * por isso não tem lista: vale para quem está lá.
 */
export function PlaceBatchSheet({
  place,
  plants,
  initialAction = "watering",
  onClose,
}: {
  place: { id: string; name: string };
  /** Plantas que estão no lugar agora (as que saíram da coleção são filtradas aqui) */
  plants: CollectionPlant[];
  initialAction?: BatchAction;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [action, setAction] = useState<BatchAction>(initialAction);
  const [when, setWhen] = useState<When>("now");
  const [notes, setNotes] = useState("");
  const [temperature, setTemperature] = useState("");
  const [humidity, setHumidity] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const here = useMemo(() => plants.filter((p) => joinsBatch(p.status)), [plants]);
  const ids = useMemo(() => here.map((p) => p.id), [here]);
  const at = useMemo(() => instantOf(when), [when]);
  const isReading = action === "reading";

  const context = useQuery({
    queryKey: ["batch-context", place.id, action],
    queryFn: () => api.get<BatchContext>(`/places/${place.id}/batch-context?type=${action}`),
    enabled: !isReading,
    staleTime: 0,
  });

  const defaults = useMemo(() => {
    if (isReading || !context.data) return null;
    return batchDefaults({
      plantIds: ids,
      recent: context.data.recent.map((e) => ({ plantId: e.plantId, occurredAt: new Date(e.occurredAt) })),
      remembered: context.data.remembered,
      day: toLocalDate(at, LOCAL_TZ),
      timeZone: LOCAL_TZ,
    });
  }, [isReading, context.data, ids, at]);

  // Mudou a ação ou o dia: a seleção volta para o padrão daquela combinação
  useEffect(() => {
    if (defaults) setChecked(new Set(defaults.checked));
  }, [defaults]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["timeline"] });
    qc.invalidateQueries({ queryKey: ["plants"] });
    qc.invalidateQueries({ queryKey: ["batch-context", place.id] });
  };

  const save = useMutation({
    mutationFn: async (): Promise<() => Promise<unknown>> => {
      // "Agora" é a hora do toque no botão, não a da abertura da folha
      const occurredAt = when === "now" ? new Date() : at;
      if (isReading) {
        const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));
        const reading = await api.post<{ id: string }>(`/places/${place.id}/readings`, {
          measuredAt: occurredAt,
          temperature: num(temperature),
          humidity: num(humidity),
        });
        return () => api.delete(`/places/${place.id}/readings/${reading.id}`);
      }
      const batch = await api.post<BatchCreated>(`/places/${place.id}/batches`, {
        type: action,
        occurredAt,
        notes: notes.trim() || null,
        plantIds: ids.filter((id) => checked.has(id)),
        rememberExcluded: exclusionsToRemember(ids, checked, defaults?.skipped ?? {}),
      });
      return () => api.post(`/places/${place.id}/batches/${batch.batchId}/undo`, { restoreExcluded: batch.previousExcluded });
    },
    onSuccess: (undo) => {
      refresh();
      onClose();
      const n = checked.size;
      toast({
        message: isReading ? `${ACTIONS.reading.saved} em ${place.name}.` : `${ACTIONS[action].saved} em ${n} ${n === 1 ? "planta" : "plantas"}.`,
        duration: 8000,
        actions: [
          {
            label: "Desfazer",
            run: () =>
              undo()
                .then(() => toast({ message: isReading ? "Medição desfeita." : "Lote desfeito. Nenhuma planta ficou com o registro." }))
                .catch((e: unknown) => toast({ message: e instanceof Error ? e.message : "Não foi possível desfazer." }))
                .finally(refresh),
          },
        ],
      });
    },
  });

  const n = checked.size;
  const remembered = ids.filter((id) => defaults?.skipped[id]?.kind === "remembered" && !checked.has(id));
  const missingReading = isReading && !temperature.trim() && !humidity.trim();
  const missingNote = action === "note" && !notes.trim();
  const loadingList = !isReading && !defaults && !context.error;
  const disabled = save.isPending || loadingList || missingReading || missingNote || (!isReading && n === 0);
  const label = loadingList
    ? "Conferindo os registros do dia…"
    : missingReading
      ? "Informe temperatura ou umidade"
      : missingNote
        ? "Escreva a nota"
        : isReading
          ? `Registrar medição em ${place.name}`
          : n === 0
            ? "Marque ao menos uma planta"
            : `Registrar ${ACTIONS[action].noun} em ${n} ${n === 1 ? "planta" : "plantas"}`;

  function toggle(id: string, on: boolean) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!disabled) save.mutate();
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end bg-[#24382a]/40 backdrop-blur-[3px]" onClick={onClose}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="batch-title"
        onSubmit={onSubmit}
        onClick={(e) => e.stopPropagation()}
        className="pagina mx-auto flex max-h-[calc(92dvh-env(safe-area-inset-top))] w-full max-w-2xl flex-col rounded-t-2xl border border-b-0 border-linha bg-folha shadow-caderno"
      >
        <div className="overflow-y-auto overscroll-contain px-5 pt-5 pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="eyebrow">{place.name}</p>
              <h2 id="batch-title" className="mt-1 text-[1.75rem] tracking-[-0.02em]">
                Registrar no local
              </h2>
            </div>
            <button type="button" onClick={onClose} aria-label="Fechar" className="grid size-11 shrink-0 place-items-center rounded-full text-musgo active:bg-salvia-clara">
              <Icon name="close" />
            </button>
          </div>

          <fieldset className="mt-5">
            <legend className="eyebrow mb-2">O que foi feito</legend>
            <div className="flex flex-wrap gap-2">
              {ACTION_ORDER.map((a) => (
                <button
                  key={a}
                  type="button"
                  aria-pressed={a === action}
                  onClick={() => setAction(a)}
                  className={`${chip} ${a === action ? "border-tinta bg-tinta text-folha" : "border-linha bg-folha text-folhagem active:bg-salvia-clara"}`}
                >
                  <Icon name={ACTIONS[a].icon} className="size-4" />
                  {ACTIONS[a].label}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="mt-5 grid gap-3 sm:grid-cols-[11rem_minmax(0,1fr)]">
            <Field label="Quando">
              <Select value={when} onChange={(e) => setWhen(e.target.value as When)}>
                {(Object.keys(WHEN_LABEL) as When[]).map((w) => (
                  <option key={w} value={w}>
                    {WHEN_LABEL[w]}
                  </option>
                ))}
              </Select>
            </Field>
            {isReading ? (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Temperatura (°C)">
                  <Input value={temperature} onChange={(e) => setTemperature(e.target.value)} type="number" step="0.1" inputMode="decimal" />
                </Field>
                <Field label="Umidade (%)">
                  <Input value={humidity} onChange={(e) => setHumidity(e.target.value)} type="number" step="1" min="0" max="100" inputMode="numeric" />
                </Field>
              </div>
            ) : (
              <Field label={action === "note" ? "Nota" : "Observação (opcional)"}>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={ACTIONS[action].placeholder} maxLength={4000} />
              </Field>
            )}
          </div>

          {isReading ? (
            <p className="mt-5 flex items-start gap-2 rounded-lg bg-salvia-clara px-3 py-2.5 text-[0.85rem] text-folhagem">
              <Icon name="pin" className="mt-0.5 size-4" />
              <span>
                Medição do local: vale para {here.length === 1 ? "a planta que está" : `as ${here.length} plantas que estão`} em {place.name} agora.
                Quem chegar depois não herda esta leitura.
              </span>
            </p>
          ) : (
            <section className="mt-5" aria-label="Plantas do lote">
              <div className="flex items-baseline justify-between gap-3 border-b border-linha pb-2">
                <p className="font-serif text-[1.1rem]">
                  {n} de {here.length} {here.length === 1 ? "planta" : "plantas"}
                </p>
                <button
                  type="button"
                  onClick={() => setChecked(n === here.length ? new Set() : new Set(ids))}
                  className="min-h-11 text-[0.85rem] text-orquidea underline underline-offset-3"
                >
                  {n === here.length ? "Desmarcar todas" : "Marcar todas"}
                </button>
              </div>
              {remembered.length > 0 && (
                <p className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-ocre-claro px-3 py-2 text-[0.82rem] text-ocre">
                  <Icon name="history" className="size-4" />
                  <span>
                    {remembered.length === 1 ? "1 desmarcada" : `${remembered.length} desmarcadas`} como na última {ACTIONS[action].noun}.
                  </span>
                  <button type="button" onClick={() => setChecked((prev) => new Set([...prev, ...remembered]))} className="min-h-9 underline underline-offset-3">
                    Incluir de volta
                  </button>
                </p>
              )}
              <ErrorText error={context.error} />
              <ul>
                {here.map((p) => {
                  const on = checked.has(p.id);
                  const reason = !on ? defaults?.skipped[p.id] : undefined;
                  return (
                    <li key={p.id} className="border-b border-linha">
                      <label className="grid cursor-pointer grid-cols-[1.5rem_2.75rem_minmax(0,1fr)] items-center gap-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={on}
                          disabled={loadingList}
                          onChange={(e) => toggle(p.id, e.target.checked)}
                          className="size-5 accent-[var(--tinta)]"
                        />
                        <span className={`grid size-11 place-items-center overflow-hidden rounded-md border border-linha bg-salvia-clara/60 ${on ? "" : "opacity-50"}`}>
                          <Thumb plant={p} />
                        </span>
                        <span className="min-w-0">
                          <span className={`flex min-w-0 items-baseline gap-2 ${on ? "" : "opacity-55"}`}>
                            <span className="typed shrink-0 text-[0.66rem]">nº {formatAccession(p.accessionNumber)}</span>
                            <span className="truncate font-serif text-[1rem]">
                              <PlantTaxon plant={p} />
                            </span>
                          </span>
                          <span className={`block truncate text-[0.78rem] ${reason ? "text-ocre" : "text-musgo"}`}>
                            {reason ? reasonText(reason, action) : p.nickname}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>

        <div className="space-y-1.5 border-t border-linha px-5 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <ErrorText error={save.error} />
          <button
            type="submit"
            disabled={disabled}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-tinta px-5 text-[0.95rem] font-medium text-folha transition-colors active:bg-tinta-viva disabled:opacity-45"
          >
            {label}
          </button>
          <p className="typed text-center text-[0.7rem]">
            {typedDate(at)} · {hour(at)} · {isReading ? "um registro do local" : "um registro no livro de cada planta"}
          </p>
        </div>
      </form>
    </div>
  );
}

function Thumb({ plant }: { plant: CollectionPlant }) {
  if (plant.lastPhotoId && plant.coverIllustratedAt) {
    return <img src={illustrationUrl(plant.lastPhotoId, plant.coverIllustratedAt, "thumb")} alt="" className="h-full w-full bg-prancha object-contain" />;
  }
  if (plant.lastPhotoId) return <img src={photoUrl(plant.lastPhotoId, "thumb")} alt="" className="h-full w-full object-cover" />;
  return <PressedOrchid className="h-7 w-4" />;
}
