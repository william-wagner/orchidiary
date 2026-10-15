import type { Environment } from "@orchidiary/shared";
import { useState } from "react";
import { api, type LocationCheck } from "../lib/api.ts";
import { formatDistance } from "../lib/geo.ts";
import { EnvironmentPicker } from "./EnvironmentPicker.tsx";
import { Button, ErrorText, Field, Input } from "./ui.tsx";

/**
 * Aparece quando a foto foi tirada longe do local da ficha.
 * Se a planta mudou, registra um NOVO local a partir do momento da foto —
 * o histórico anterior (e o clima dele) fica como estava.
 */
export function MovePrompt({
  plantId,
  check,
  takenAt,
  onDone,
}: {
  plantId: string;
  check: LocationCheck;
  takenAt: string;
  onDone: (moved: boolean) => void;
}) {
  const [environment, setEnvironment] = useState<Environment>(check.plantLocation.environment);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function confirmMove() {
    setBusy(true);
    try {
      await api.post(`/plants/${plantId}/locations`, {
        lat: check.photoLocation.lat,
        lng: check.photoLocation.lng,
        label: label || undefined,
        environment,
        validFrom: takenAt,
      });
      onDone(true);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="move-title" className="fixed inset-0 z-20 flex items-end bg-black/40">
      <div className="mx-auto w-full max-w-xl space-y-4 rounded-t-3xl bg-velame p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
        <h2 id="move-title" className="font-serif text-2xl font-semibold">
          A planta mudou de lugar?
        </h2>
        <p>
          Esta foto foi tirada a {formatDistance(check.distanceMeters)} do local registrado
          {check.plantLocation.label ? ` (${check.plantLocation.label})` : ""}.
        </p>

        {check.canMoveFromPhoto ? (
          <>
            <p className="text-sm text-musgo-2">
              Se mudou, o novo local vale a partir desta foto. O histórico anterior continua ligado ao local antigo.
            </p>
            <Field label="Nome do novo lugar" hint="Opcional">
              <Input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} />
            </Field>
            <EnvironmentPicker value={environment} onChange={setEnvironment} />
            <ErrorText error={error} />
            <div className="grid grid-cols-2 gap-2">
              <Button variant="quiet" onClick={() => onDone(false)}>
                Não, só a foto
              </Button>
              <Button onClick={confirmMove} disabled={busy}>
                Sim, mudou
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-musgo-2">
              A foto é anterior ao local atual, então ela não pode mudar o local da planta. Ela fica no diário na data em que foi tirada.
            </p>
            <Button onClick={() => onDone(false)} className="w-full">
              Entendi
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
