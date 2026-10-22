import { type CareField, RANK_LABEL } from "@orchidiary/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { OriginFlag } from "../components/OriginFlag.tsx";
import { ancestorsLabel, TaxonName } from "../components/Taxon.tsx";
import { BackLink, Icon, PageHeader } from "../components/ui.tsx";
import { api, type TaxonHit, type TaxonRef, type TaxonSheet } from "../lib/api.ts";

const MONTHS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const MONTH_NAMES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

/** Sem busca: os táxons com ficha própria. Com busca: o catálogo inteiro. */
export function Guide() {
  const [q, setQ] = useState("");
  const term = q.trim();
  const list = useQuery({
    queryKey: ["taxa", "guide", term],
    queryFn: () => api.get<TaxonHit[]>(`/taxa${term ? `?q=${encodeURIComponent(term)}&limit=50` : ""}`),
    placeholderData: keepPreviousData,
  });
  const n = list.data?.length ?? 0;
  const kicker = !list.data ? " " : term ? `${n} ${n === 1 ? "táxon encontrado" : "táxons encontrados"}` : `${n} ${n === 1 ? "ficha" : "fichas"}`;
  return (
    <main>
      <PageHeader kicker={kicker} title="Guia de Cultivo" />
      <div className="px-5">
        <label className="flex min-h-12 items-center gap-2.5 rounded-md border border-contorno bg-folha px-3.5 text-musgo focus-within:border-tinta">
          <Icon name="guide" className="size-4" />
          <input
            type="search"
            aria-label="Buscar no catálogo"
            placeholder="Gênero, espécie, híbrido ou nome popular"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="min-w-0 flex-1 bg-transparent py-3 text-[0.92rem] text-tinta placeholder:text-musgo/70 focus:outline-none"
          />
        </label>
        <ul className="mt-5 border-t border-linha">
          {list.data?.map((t) => (
            <li key={t.id} className="border-b border-linha">
              <Link to={`/guia/${t.id}`} className="flex items-center gap-3 py-4 transition-[padding] hover:pl-2">
                <span className="min-w-0 flex-1">
                  <span className="block font-serif text-[1.45rem] leading-tight">
                    <TaxonName lineage={t.lineage} /> <OriginFlag origin={t.origin} />
                  </span>
                  <span className="typed mt-1 block truncate text-[0.66rem] tracking-[0.06em] uppercase">
                    {RANK_LABEL[t.rank]}
                    {t.lineage.length > 1 && ` · ${ancestorsLabel(t.lineage, 2)}`}
                  </span>
                  {t.commonNames.length > 0 && (
                    <span className="mt-0.5 block truncate text-[0.85rem] text-musgo">{t.commonNames.slice(0, 4).join(", ")}</span>
                  )}
                </span>
                <Icon name="chevron" className="size-4 text-musgo" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}

const range = (a: number | null, b: number | null, unit: string) =>
  a == null && b == null ? "não informado" : `${a ?? "?"}–${b ?? "?"}${unit}`;

export function TaxonPage() {
  const { id } = useParams();
  const s = useQuery({ queryKey: ["taxa", "one", id], queryFn: () => api.get<TaxonSheet>(`/taxa/${id}`) }).data;
  if (!s) return <p className="typed p-6">Abrindo a ficha…</p>;

  const { care, careSources } = s;
  const ancestors = s.lineage.slice(0, -1);
  /** Linhagem até o táxon de onde veio o campo, se não for o próprio */
  const inheritedFrom = (...fields: CareField[]): TaxonRef[] | null => {
    const sourceId = fields.map((f) => careSources[f]).find(Boolean);
    if (!sourceId || sourceId === s.id) return null;
    const at = s.lineage.findIndex((t) => t.id === sourceId);
    return at >= 0 ? s.lineage.slice(0, at + 1) : null;
  };

  const ranges = [
    { k: "Temperatura de dia", v: range(care.tempDayMin, care.tempDayMax, "°C"), from: inheritedFrom("tempDayMin", "tempDayMax") },
    { k: "Temperatura à noite", v: range(care.tempNightMin, care.tempNightMax, "°C"), from: inheritedFrom("tempNightMin", "tempNightMax") },
    { k: "Umidade do ar", v: range(care.humidityMin, care.humidityMax, " %"), from: inheritedFrom("humidityMin", "humidityMax") },
  ];
  const bloomText = care.bloomMonths.length ? care.bloomMonths.map((m) => MONTH_NAMES[m - 1]).join(", ") : "sem registro";
  const bloomFrom = inheritedFrom("bloomMonths");
  const hasAnyCare = Object.keys(careSources).length > 0;

  return (
    <main className="pb-8">
      <div className="px-5 pt-3">
        <Link to="/guia">
          <BackLink>Guia de Cultivo</BackLink>
        </Link>
      </div>

      <header className="mx-5 mt-2 rounded-t-xl border border-linha bg-salvia-clara px-5 pt-5 pb-5">
        {ancestors.length > 0 && (
          <nav aria-label="Classificação" className="typed flex flex-wrap gap-x-1.5 text-[0.7rem] leading-relaxed">
            {ancestors.map((t, i) => (
              <span key={t.id} className="whitespace-nowrap">
                <Link to={`/guia/${t.id}`} className="underline decoration-dotted underline-offset-2" title={RANK_LABEL[t.rank]}>
                  {t.name}
                </Link>
                {i < ancestors.length - 1 && <span aria-hidden="true"> ›</span>}
              </span>
            ))}
          </nav>
        )}
        <h1 className="mt-2 text-[2.3rem] leading-[1.05] tracking-[-0.03em] [overflow-wrap:anywhere]">
          <TaxonName lineage={s.lineage} /> <OriginFlag origin={s.origin} />

        </h1>
        <p className="eyebrow mt-2">{RANK_LABEL[s.rank]}</p>
        {s.commonNames.length > 0 && <p className="mt-2 text-[0.88rem] text-musgo">Nomes populares e antigos: {s.commonNames.join(", ")}</p>}
      </header>

      <div className="mx-5 rounded-b-xl border border-t-0 border-linha bg-folha px-5 pt-1 pb-6">
      {hasAnyCare ? (
        <>
          <dl className="mt-4 flex flex-col gap-2 text-[0.95rem]">
            {ranges.map((r) => (
              <div key={r.k}>
                <div className="flex items-baseline gap-1.5">
                  <dt className="whitespace-nowrap">{r.k}</dt>
                  <span className="leader" aria-hidden="true" />
                  <dd className="typed text-[0.82rem] whitespace-nowrap text-tinta">{r.v}</dd>
                </div>
                {r.from && <InheritedNote from={r.from} />}
              </div>
            ))}
          </dl>

          <section className="mt-6" aria-label="Época de floração">
            <h2 className="mb-2 text-[1.3rem]">Época de floração</h2>
            <div className="grid grid-cols-12 gap-[3px]" role="img" aria-label={`Floresce em: ${bloomText}`}>
              {MONTHS.map((l, i) => {
                const on = care.bloomMonths.includes(i + 1);
                return (
                  <div key={i} className="flex flex-col items-center gap-1">
                    <div className={`h-6 w-full rounded-[3px] ${on ? "bg-orquidea" : "bg-salvia-clara"}`} />
                    <span className="typed text-[0.62rem]">{l}</span>
                  </div>
                );
              })}
            </div>
            {bloomFrom && <InheritedNote from={bloomFrom} />}
          </section>

          <div className="mt-2 max-w-prose divide-y divide-linha leading-relaxed">
            <Section title="Luz" text={care.light} from={inheritedFrom("light")} />
            <Section title="Rega" text={care.watering} from={inheritedFrom("watering")} />
            <Section title="Adubação" text={care.fertilizing} from={inheritedFrom("fertilizing")} />
            <Section title="Substrato e vaso" text={care.substrate} from={inheritedFrom("substrate")} />
            <Section title="Repouso" text={care.restPeriod} from={inheritedFrom("restPeriod")} />
            <Section title="Observações" text={s.notes} from={null} />
          </div>
        </>
      ) : (
        <p className="mt-4 max-w-prose text-musgo">
          Ainda não há ficha de cultivo para este táxon nem para os níveis acima dele.
        </p>
      )}
      </div>

      {s.children.length > 0 && (
        <section className="mx-5 mt-7" aria-label="Táxons abaixo">
          <h2 className="border-b border-linha pb-2 text-[1.4rem]">
            Abaixo de <TaxonName lineage={s.lineage} />
            <span className="typed ml-2 text-[0.75rem]">{s.children.length}</span>
          </h2>
          <ul>
            {s.children.map((c) => (
              <li key={c.id} className="border-b border-linha">
                <Link to={`/guia/${c.id}`} className="flex items-baseline justify-between gap-3 py-3">
                  <TaxonName lineage={[...s.lineage, c]} className="min-w-0 truncate font-serif text-[1.2rem]" />
                  <span className="typed shrink-0 text-[0.66rem] tracking-[0.06em] uppercase">{RANK_LABEL[c.rank]}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

/** "Herdado de Vanda": o campo veio de um nível acima. */
function InheritedNote({ from }: { from: TaxonRef[] }) {
  return (
    <p className="mt-0.5 text-[0.78rem] text-musgo">
      herdado de <TaxonName lineage={from} />
    </p>
  );
}

function Section({ title, text, from }: { title: string; text: string | null; from: TaxonRef[] | null }) {
  if (!text) return null;
  return (
    <section className="py-5">
      <h2 className="text-[1.3rem]">{title}</h2>
      <p className="mt-1.5 text-[0.93rem] text-tinta/90">{text}</p>
      {from && <InheritedNote from={from} />}
    </section>
  );
}
