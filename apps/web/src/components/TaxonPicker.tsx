import { RANK_LABEL } from "@orchidiary/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { api, type TaxonHit, type TaxonSummary } from "../lib/api.ts";
import { ancestorsLabel, TaxonName } from "./Taxon.tsx";

/** Valor que só muda depois que a pessoa para de digitar por `ms`. */
export function useDebounced<T>(value: T, ms: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

/**
 * Campo "Espécie": busca no catálogo inteiro conforme a pessoa digita
 * (gênero, espécie, variedade, híbrido, nome popular ou nome antigo).
 * Qualquer nível serve: quem só sabe que é uma Vanda escolhe o gênero.
 */
export function TaxonPicker({
  value,
  onChange,
  label = "Espécie",
  labelHidden = false,
  aside,
  autoFocus = false,
  hint = "Pode ser só o gênero, se você não souber a espécie.",
  emptyHint = "Nada no catálogo com esse nome. Anote o que veio escrito em “Como veio na etiqueta”.",
}: {
  value: TaxonSummary | null;
  onChange: (taxon: TaxonSummary | null) => void;
  label?: string;
  /** O rótulo fica só para leitores de tela (quem usa já tem um cabeçalho próprio) */
  labelHidden?: boolean;
  /** Algo ao lado do rótulo, como o interruptor "É uma cruza" */
  aside?: ReactNode;
  autoFocus?: boolean;
  hint?: string | null;
  /** O que dizer quando a busca não acha nada */
  emptyHint?: string;
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const q = useDebounced(text.trim(), 180);

  const search = useQuery({
    queryKey: ["taxa", "search", q],
    queryFn: () => api.get<TaxonHit[]>(`/taxa?q=${encodeURIComponent(q)}&limit=12`),
    enabled: q.length >= 2,
    placeholderData: keepPreviousData,
  });
  const hits = q.length >= 2 ? (search.data ?? []) : [];
  const showList = open && q.length >= 2 && !search.isPending;

  function choose(t: TaxonSummary) {
    onChange(t);
    setText("");
    setOpen(false);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (hits.length ? (i + step + hits.length) % hits.length : 0));
    } else if (e.key === "Enter" && showList && hits[active]) {
      e.preventDefault(); // escolhe o táxon em vez de enviar o formulário
      choose(hits[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const labelClass = labelHidden ? "sr-only" : "block font-mono text-[0.74rem] tracking-[0.02em] text-folhagem";
  const header = (labelEl: ReactNode) =>
    aside ? (
      <div className="mb-1 flex min-h-11 items-center justify-between gap-3">
        {labelEl}
        {aside}
      </div>
    ) : (
      <div className={labelHidden ? "" : "mb-1.5"}>{labelEl}</div>
    );

  if (value) {
    return (
      <div>
        {header(<span className={labelClass}>{label}</span>)}
        <div className="cartao flex items-start justify-between gap-3 px-3 py-2">
          <div className="min-w-0">
            <TaxonName lineage={value.lineage} className="block font-serif text-[1.2rem] leading-tight" />
            <span className="typed block text-[0.78rem]">
              {RANK_LABEL[value.rank]}
              {value.lineage.length > 1 && ` · ${ancestorsLabel(value.lineage)}`}
            </span>
          </div>
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
    <div>
      {header(
        <label htmlFor={id} className={labelClass}>
          {label}
        </label>,
      )}
      <div className="relative">
      <input
        ref={inputRef}
        id={id}
        type="search"
        role="combobox"
        aria-expanded={showList}
        aria-controls={`${id}-list`}
        aria-activedescendant={showList && hits[active] ? `${id}-${hits[active].id}` : undefined}
        aria-autocomplete="list"
        autoComplete="off"
        autoFocus={autoFocus}
        placeholder="Ex.: Vanda, walkeriana, chuva-de-ouro"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        className="w-full min-h-12 rounded-md border border-contorno bg-folha px-3 text-[0.95rem] text-tinta placeholder:text-musgo/70 focus:border-tinta focus:outline-none"
      />
      {showList && (
        <ul
          id={`${id}-list`}
          role="listbox"
          aria-label="Táxons encontrados"
          className="absolute inset-x-0 top-full z-20 mt-1 max-h-80 overflow-y-auto rounded-lg border border-contorno bg-folha shadow-caderno"
        >
          {hits.length === 0 && (
            <li className="px-3 py-3 text-musgo">{emptyHint}</li>
          )}
          {hits.map((t, i) => (
            <li
              key={t.id}
              id={`${id}-${t.id}`}
              role="option"
              aria-selected={i === active}
              // mousedown, e não click: o blur do campo fecharia a lista antes do clique
              onMouseDown={(e) => {
                e.preventDefault();
                choose(t);
              }}
              onMouseEnter={() => setActive(i)}
              className={`cursor-pointer border-b border-linha px-3 py-2 last:border-b-0 ${i === active ? "bg-salvia-clara" : ""}`}
            >
              <TaxonName lineage={t.lineage} className="block font-serif text-[1.1rem] leading-tight" />
              <span className="typed block truncate text-[0.75rem]">
                {RANK_LABEL[t.rank]}
                {t.lineage.length > 1 && ` · ${ancestorsLabel(t.lineage, 2)}`}
              </span>
              {t.commonNames.length > 0 && (
                <span className="block truncate text-[0.9rem] text-musgo">{t.commonNames.slice(0, 3).join(", ")}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      </div>
      {hint && <span className="mt-1.5 block text-[0.82rem] text-musgo">{hint}</span>}
    </div>
  );
}
