import { normalizeSearch } from "@orchidiary/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type KeyboardEvent, useId, useRef, useState } from "react";
import { api, type Place } from "../lib/api.ts";
import { ErrorText } from "./ui.tsx";

export type PlaceRef = Pick<Place, "id" | "name">;

const plantsLabel = (n: number) => (n === 1 ? "1 planta" : `${n} plantas`);

/**
 * Campo "Nome do lugar". Tudo acontece no próprio campo:
 *  - digitar filtra os lugares já cadastrados;
 *  - um nome que ainda não existe aparece como "Cadastrar “…”";
 *  - cada lugar da lista pode ser renomeado ou apagado (só se nenhuma planta o usou).
 */
export function PlacePicker({
  value,
  onChange,
  label = "Nome do lugar",
}: {
  value: PlaceRef | null;
  onChange: (place: PlaceRef | null) => void;
  label?: string;
}) {
  const id = useId();
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  const places = useQuery({ queryKey: ["places"], queryFn: () => api.get<Place[]>("/places"), enabled: !value });

  const typed = text.trim();
  const needle = normalizeSearch(typed);
  const matches = (places.data ?? []).filter((p) => normalizeSearch(p.name).includes(needle));
  const exists = (places.data ?? []).some((p) => p.name.toLowerCase() === typed.toLowerCase());
  const canCreate = typed.length > 0 && !exists;
  const rowCount = matches.length + (canCreate ? 1 : 0);
  const showList = open && !value && places.isSuccess;

  const refresh = () => qc.invalidateQueries({ queryKey: ["places"] });
  // o nome aparece na coleção e na ficha das plantas
  const refreshPlants = () => {
    qc.invalidateQueries({ queryKey: ["plants"] });
    qc.invalidateQueries({ queryKey: ["timeline"] });
  };

  function choose(p: PlaceRef) {
    onChange({ id: p.id, name: p.name });
    setText("");
    setOpen(false);
    setEditing(null);
    setRemoving(null);
  }

  const create = useMutation({
    mutationFn: (name: string) => api.post<Place>("/places", { name }),
    onSuccess: (p) => {
      refresh();
      choose(p);
    },
  });
  const rename = useMutation({
    mutationFn: (v: { id: string; name: string }) => api.patch<Place>(`/places/${v.id}`, { name: v.name }),
    onSuccess: () => {
      setEditing(null);
      refresh();
      refreshPlants();
    },
  });
  const remove = useMutation({
    mutationFn: (placeId: string) => api.delete(`/places/${placeId}`),
    onSuccess: () => {
      setRemoving(null);
      refresh();
    },
    onError: () => setRemoving(null),
  });
  const error = create.error ?? rename.error ?? remove.error;

  function clearErrors() {
    create.reset();
    rename.reset();
    remove.reset();
  }

  function saveRename(p: Place) {
    const name = editing?.name.trim();
    if (name && name !== p.name) rename.mutate({ id: p.id, name });
    else setEditing(null);
  }

  function pick(index: number) {
    if (index < matches.length) choose(matches[index]!);
    else if (canCreate) create.mutate(typed);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (rowCount ? (i + step + rowCount) % rowCount : 0));
    } else if (e.key === "Enter") {
      e.preventDefault(); // escolhe/cadastra em vez de enviar o formulário
      if (showList && rowCount > 0) pick(Math.min(active, rowCount - 1));
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  if (value) {
    return (
      <div>
        <span className="mb-1.5 block font-mono text-[0.74rem] tracking-[0.02em] text-folhagem">{label}</span>
        <div className="cartao flex items-center justify-between gap-3 px-3 py-2">
          <span className="min-w-0 truncate font-serif text-[1.2rem] leading-tight">{value.name}</span>
          <button
            type="button"
            className="min-h-11 shrink-0 px-2 text-orquidea"
            onClick={() => {
              onChange(null);
              requestAnimationFrame(() => inputRef.current?.focus());
            }}
          >
            Trocar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
          setOpen(false);
          setEditing(null);
          setRemoving(null);
        }
      }}
    >
      <label htmlFor={id} className="mb-1.5 block font-mono text-[0.74rem] tracking-[0.02em] text-folhagem">
        {label}
      </label>
      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        aria-expanded={showList}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        autoComplete="off"
        maxLength={120}
        placeholder="Ex.: Varanda dos fundos"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setActive(0);
          setOpen(true);
          clearErrors();
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className="w-full min-h-12 rounded-md border border-contorno bg-folha px-3 text-[0.95rem] text-tinta placeholder:text-musgo/70 focus:border-tinta focus:outline-none"
      />
      <span className="mt-1.5 block text-[0.82rem] text-musgo">
        Opcional. Digite para buscar; um nome novo é cadastrado aqui mesmo.
      </span>
      <ErrorText error={error} />
      {showList && (
        <ul
          id={`${id}-list`}
          role="listbox"
          aria-label="Lugares cadastrados"
          // mousedown no fundo da lista não tira o foco do campo (o campo de renomear é exceção)
          onMouseDown={(e) => {
            if (!(e.target instanceof HTMLInputElement)) e.preventDefault();
          }}
          className="absolute inset-x-0 top-[4.6rem] z-20 max-h-80 overflow-y-auto rounded-lg border border-contorno bg-folha shadow-caderno"
        >
          {rowCount === 0 && (
            <li className="px-3 py-3 text-musgo">Nenhum lugar cadastrado ainda. Digite um nome para criar o primeiro.</li>
          )}
          {matches.map((p, i) => (
            <li
              key={p.id}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              className={`border-b border-linha last:border-b-0 ${i === active ? "bg-salvia-clara" : ""}`}
            >
              {editing?.id === p.id ? (
                // div, não form: o campo já está dentro do formulário da página
                <div className="flex items-center gap-2 px-3 py-1">
                  <input
                    autoFocus
                    aria-label={`Novo nome para ${p.name}`}
                    value={editing.name}
                    maxLength={120}
                    onChange={(e) => setEditing({ id: p.id, name: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        saveRename(p);
                      } else if (e.key === "Escape") {
                        e.stopPropagation();
                        setEditing(null);
                      }
                    }}
                    className="min-h-11 min-w-0 flex-1 rounded-md border border-contorno bg-folha px-2 text-[0.95rem] text-tinta"
                  />
                  <button
                    type="button"
                    disabled={rename.isPending}
                    onClick={() => saveRename(p)}
                    className="min-h-11 px-2 text-orquidea disabled:opacity-45"
                  >
                    Salvar
                  </button>
                  <button type="button" onClick={() => setEditing(null)} className="min-h-11 px-1 text-musgo">
                    Cancelar
                  </button>
                </div>
              ) : removing === p.id ? (
                <div className="flex items-center justify-between gap-2 px-3 py-1">
                  <span className="min-w-0 truncate">Apagar “{p.name}”?</span>
                  <span className="flex shrink-0">
                    <button
                      type="button"
                      disabled={remove.isPending}
                      onClick={() => remove.mutate(p.id)}
                      className="min-h-11 px-2 text-alerta disabled:opacity-45"
                    >
                      Apagar
                    </button>
                    <button type="button" onClick={() => setRemoving(null)} className="min-h-11 px-2 text-musgo">
                      Manter
                    </button>
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-1 pl-3">
                  <button type="button" onClick={() => choose(p)} className="min-h-12 min-w-0 flex-1 py-1.5 text-left">
                    <span className="block truncate font-serif text-[1.1rem] leading-tight">{p.name}</span>
                    {p.plantCount > 0 && <span className="typed block text-[0.75rem]">{plantsLabel(p.plantCount)} aqui</span>}
                  </button>
                  <button
                    type="button"
                    aria-label={`Renomear ${p.name}`}
                    onClick={() => {
                      clearErrors();
                      setRemoving(null);
                      setEditing({ id: p.id, name: p.name });
                    }}
                    className="min-h-11 px-2 text-orquidea"
                  >
                    Renomear
                  </button>
                  {p.usedCount === 0 && (
                    <button
                      type="button"
                      aria-label={`Apagar ${p.name}`}
                      onClick={() => {
                        clearErrors();
                        setEditing(null);
                        setRemoving(p.id);
                      }}
                      className="min-h-11 px-2 pr-3 text-musgo"
                    >
                      Apagar
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
          {canCreate && (
            <li
              role="option"
              aria-selected={active === matches.length}
              onMouseEnter={() => setActive(matches.length)}
              className={active === matches.length ? "bg-salvia-clara" : ""}
            >
              <button
                type="button"
                disabled={create.isPending}
                onClick={() => create.mutate(typed)}
                className="min-h-12 w-full px-3 py-1.5 text-left text-orquidea disabled:opacity-45"
              >
                Cadastrar “{typed}”
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
