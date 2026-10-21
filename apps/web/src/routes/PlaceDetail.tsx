import { formatLocality } from "@orchidiary/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { PlaceReadout, PlaceSparkline } from "../components/PlaceWeather.tsx";
import { BackLink, Button, ErrorText, Icon, Input } from "../components/ui.tsx";
import { api, type PlaceDetail as Place } from "../lib/api.ts";
import { coords, environmentLabel, typedDate } from "../lib/format.ts";
import { getPosition, type Position } from "../lib/geo.ts";

const plantsLabel = (n: number) => (n === 1 ? "1 planta" : `${n} plantas`);

/**
 * Ficha do lugar: clima próprio, localização (com histórico) e quem está aqui.
 * Mudar a localização nunca reescreve o passado: fecha o período atual e abre outro.
 */
export function PlaceDetailPage() {
  const { id = "" } = useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const place = useQuery({ queryKey: ["place", id], queryFn: () => api.get<Place>(`/places/${id}`) });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["place", id] });
    qc.invalidateQueries({ queryKey: ["places"] });
    // o nome, o ambiente e a localização aparecem nas fichas das plantas
    qc.invalidateQueries({ queryKey: ["plants"] });
    qc.invalidateQueries({ queryKey: ["timeline"] });
  };

  const save = useMutation({
    mutationFn: (body: unknown) => api.patch<Place>(`/places/${id}`, body),
    onSuccess: () => {
      setRenaming(null);
      refresh();
    },
  });

  const remove = useMutation({
    mutationFn: () => api.delete(`/places/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["places"] });
      navigate("/lugares", { replace: true });
    },
  });

  if (place.isPending) return <main className="px-5 py-10 text-musgo">Abrindo o lugar…</main>;
  if (place.error || !place.data) return <main className="px-5 py-10 text-alerta">Lugar não encontrado.</main>;
  const p = place.data;
  const locality = formatLocality(p.location ?? {});

  return (
    <main className="space-y-3 pb-8">
      <div className="px-5 pt-4">
        <Link to="/lugares">
          <BackLink>Lugares</BackLink>
        </Link>
      </div>

      <header className="mx-5">
        <div className="flex items-start justify-between gap-3">
          {renaming === null ? (
            <h1 className="min-w-0 text-[2.1rem] leading-[1.08] tracking-[-0.03em]">{p.name}</h1>
          ) : (
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <Input
                autoFocus
                aria-label="Novo nome do lugar"
                maxLength={120}
                value={renaming}
                onChange={(e) => setRenaming(e.target.value)}
              />
              <button
                type="button"
                className="min-h-11 shrink-0 px-2 text-orquidea"
                disabled={save.isPending}
                onClick={() => save.mutate({ name: renaming.trim() })}
              >
                Salvar
              </button>
            </div>
          )}
          <span className={`selo mt-2 shrink-0 ${p.environment === "indoor" ? "selo-flor" : ""}`}>
            {environmentLabel(p.environment)}
          </span>
        </div>
        <p className="typed mt-1 text-[0.78rem]">
          {locality ?? "sem localização"} · {plantsLabel(p.plantCount)}
          {p.location && ` · desde ${typedDate(p.location.validFrom)}`}
        </p>
      </header>

      {/* clima do lugar */}
      <section className="cartao mx-5 px-4 py-4">
        <h2 className="font-serif text-[1.3rem]">Clima do lugar</h2>
        <div className="mt-3">
          <PlaceReadout days={p.weather.days} />
        </div>
        <PlaceSparkline days={p.weather.days} />
        <p className="mt-3 text-[0.82rem] text-musgo">
          {p.environment === "indoor"
            ? "Dentro de casa, isto é o clima de fora — referência até existir sensor aqui."
            : "Clima diário da Open-Meteo, pela localização do lugar."}
        </p>
      </section>

      {/* localização */}
      <section className="cartao mx-5 px-4 py-4">
        <h2 className="font-serif text-[1.3rem]">Localização</h2>
        {p.location ? (
          <div className="mt-2.5 flex items-center gap-3">
            <span className="grid size-14 shrink-0 place-items-center rounded-lg border border-linha bg-salvia-clara text-folhagem">
              <Icon name="pin" />
            </span>
            <div className="min-w-0">
              <p className="typed text-[0.9rem] text-tinta">{coords(p.location)}</p>
              {locality && <p className="text-[0.88rem] text-musgo">{locality}</p>}
              <p className="typed text-[0.72rem]">vale desde {typedDate(p.location.validFrom)}</p>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-[0.88rem] text-ocre">
            Este lugar ainda não tem localização. Marque uma para ele passar a ter clima próprio.
          </p>
        )}

        <div className="mt-3 flex gap-2">
          <Button variant="quiet" className="flex-1" onClick={() => setMoving(true)}>
            {p.location ? "Mudar a localização" : "Marcar a localização"}
          </Button>
          {p.history.length > 1 && (
            <Button variant="quiet" onClick={() => setShowHistory((v) => !v)}>
              Histórico
            </Button>
          )}
        </div>

        {showHistory && (
          <ol className="mt-3 space-y-2 border-t border-linha pt-3">
            {[...p.history].reverse().map((h) => (
              <li key={h.id} className="typed text-[0.78rem]">
                {typedDate(h.validFrom)} – {h.validTo ? typedDate(h.validTo) : "hoje"} · {coords(h)}
              </li>
            ))}
          </ol>
        )}

        <p className="mt-3 text-[0.82rem] text-musgo">
          Mudar daqui não altera o passado: o clima já registrado continua no período anterior, e as plantas daqui
          acompanham a partir da data da mudança.
        </p>
      </section>

      {/* plantas */}
      <section className="cartao mx-5 px-4 py-4">
        <h2 className="font-serif text-[1.3rem]">Plantas aqui</h2>
        {p.plants.length === 0 ? (
          <p className="mt-2 text-[0.88rem] text-musgo">
            Nenhuma planta neste lugar agora. O clima continua sendo registrado.
          </p>
        ) : (
          <ul className="mt-2.5 space-y-2">
            {p.plants.map((plant) => (
              <li key={plant.id}>
                <Link to={`/plantas/${plant.id}`} className="flex items-center justify-between gap-3 py-1">
                  <span className="min-w-0 truncate font-serif text-[1.05rem]">{plant.nickname}</span>
                  <span className="typed shrink-0 text-[0.72rem]">desde {typedDate(plant.since)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 rounded-lg bg-salvia-clara px-3 py-2 text-[0.82rem]">
          Todas herdam deste lugar a localização e o ambiente.
        </p>
      </section>

      {/* ambiente e ações */}
      <section className="mx-5 space-y-2">
        <div className="cartao flex items-center justify-between gap-3 px-4 py-3">
          <span className="min-w-0">
            <span className="block">Ambiente</span>
            <span className="block text-[0.82rem] text-musgo">Vale para todas as plantas daqui.</span>
          </span>
          <Button
            variant="quiet"
            disabled={save.isPending}
            onClick={() => save.mutate({ environment: p.environment === "indoor" ? "outdoor" : "indoor" })}
          >
            {p.environment === "indoor" ? "Pôr ao ar livre" : "Pôr dentro de casa"}
          </Button>
        </div>
        <div className="flex gap-2">
          <Button variant="quiet" className="flex-1" onClick={() => setRenaming(p.name)}>
            Renomear
          </Button>
          <Button
            variant="quiet"
            className="flex-1"
            disabled={p.plantCount > 0 || remove.isPending}
            onClick={() => remove.mutate()}
          >
            Apagar
          </Button>
        </div>
        <p className="text-[0.8rem] text-musgo">Só dá para apagar um lugar que nenhuma planta usou.</p>
        <ErrorText error={save.error ?? remove.error} />
      </section>

      {moving && <MovePlaceSheet placeId={p.id} hasLocation={!!p.location} onDone={() => setMoving(false)} onSaved={refresh} />}
    </main>
  );
}

/** Folha de mudança de localização do lugar. */
function MovePlaceSheet({
  placeId,
  hasLocation,
  onDone,
  onSaved,
}: {
  placeId: string;
  hasLocation: boolean;
  onDone: () => void;
  onSaved: () => void;
}) {
  const [position, setPosition] = useState<Position | null>(null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function locate() {
    setLocating(true);
    setError(null);
    const p = await getPosition();
    setLocating(false);
    if (p) setPosition(p);
    else setError(new Error("Não foi possível obter a localização. Confira a permissão do navegador."));
  }

  async function confirm() {
    if (!position) return setError(new Error("Marque a nova localização."));
    setBusy(true);
    try {
      await api.post(`/places/${placeId}/locations`, { lat: position.lat, lng: position.lng });
      onSaved();
      onDone();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="move-place-title"
      className="fixed inset-0 z-20 flex items-end bg-[#24382a]/40 backdrop-blur-[3px]"
    >
      <div className="mx-auto w-full max-w-2xl space-y-4 rounded-t-2xl border border-b-0 border-linha bg-folha p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-caderno">
        <h2 id="move-place-title" className="text-[1.7rem] tracking-[-0.02em]">
          {hasLocation ? "Mudar a localização" : "Marcar a localização"}
        </h2>
        <Button variant="quiet" onClick={locate} disabled={locating} className="w-full">
          {locating ? "Localizando…" : position ? "Marcar de novo" : "Usar minha localização atual"}
        </Button>
        {position && (
          <p className="typed text-[0.85rem]">
            {coords(position)} (precisão de {Math.round(position.accuracy)} m)
          </p>
        )}
        {hasLocation && (
          <p className="text-[0.85rem] text-musgo">
            O clima já coletado fica no período anterior — nada é reescrito. As plantas daqui passam a usar a nova
            localização a partir de agora.
          </p>
        )}
        <ErrorText error={error} />
        <div className="grid grid-cols-2 gap-2">
          <Button variant="quiet" onClick={onDone}>
            Cancelar
          </Button>
          <Button onClick={confirm} disabled={busy || !position}>
            Registrar
          </Button>
        </div>
      </div>
    </div>
  );
}
