import { type CareField, RANK_LABEL } from "@orchidiary/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { ancestorsLabel, TaxonName } from "../components/Taxon.tsx";
import { Input, PageHeader } from "../components/ui.tsx";
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
      <div className="px-4 pt-4">
        <Input
          type="search"
          aria-label="Buscar no catálogo"
          placeholder="Gênero, espécie, híbrido ou nome popular"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <ul className="mt-3">
          {list.data?.map((t) => (
            <li key={t.id} className="border-b border-dotted border-linha">
              <Link to={`/guia/${t.id}`} className="block py-3">
                <TaxonName lineage={t.lineage} className="block text-xl leading-tight" />
                <span className="typed block truncate text-[0.75rem]">
                  {RANK_LABEL[t.rank]}
                  {t.lineage.length > 1 && ` · ${ancestorsLabel(t.lineage, 2)}`}
                </span>
                {t.commonNames.length > 0 && <span className="block text-pontilhado">{t.commonNames.slice(0, 4).join(", ")}</span>}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}

const range = (a: number | null, b: number | null, unit: string) =>
  a == null && b == null ? "não informado" : `${a ?? "?"}–${b ?? "?"} ${unit}`;

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
    { k: "Umidade do ar", v: range(care.humidityMin, care.humidityMax, "%"), from: inheritedFrom("humidityMin", "humidityMax") },
  ];
  const bloomText = care.bloomMonths.length ? care.bloomMonths.map((m) => MONTH_NAMES[m - 1]).join(", ") : "sem registro";
  const bloomFrom = inheritedFrom("bloomMonths");
  const hasAnyCare = Object.keys(careSources).length > 0;

  return (
    <main className="pb-8">
      <div className="px-4 pt-3">
        <Link to="/guia" className="inline-flex min-h-11 items-center">
          Guia de Cultivo
        </Link>
      </div>

      <header className="mx-5 border-b-[3px] border-double border-sepia pb-3">
        {ancestors.length > 0 && (
          <nav aria-label="Classificação" className="typed flex flex-wrap gap-x-1.5 text-[0.8rem] leading-relaxed">
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
        <h1 className="mt-1 text-[2.4rem] leading-[1.05]">
          <TaxonName lineage={s.lineage} />
        </h1>
        <p className="mt-1 first-letter:uppercase">{RANK_LABEL[s.rank]}</p>
        {s.commonNames.length > 0 && <p className="text-pontilhado">Nomes populares e antigos: {s.commonNames.join(", ")}</p>}
      </header>

      {hasAnyCare ? (
        <>
          <dl className="mx-5 mt-4 flex flex-col gap-1.5 text-lg">
            {ranges.map((r) => (
              <div key={r.k}>
                <div className="flex items-baseline gap-1.5">
                  <dt className="whitespace-nowrap">{r.k}</dt>
                  <span className="leader" aria-hidden="true" />
                  <dd className="typed text-[0.92rem] whitespace-nowrap">{r.v}</dd>
                </div>
                {r.from && <InheritedNote from={r.from} />}
              </div>
            ))}
          </dl>

          <section className="mx-5 mt-5" aria-label="Época de floração">
            <h2 className="mb-1.5 text-lg font-medium">Época de floração</h2>
            <div className="grid grid-cols-12 gap-[3px]" role="img" aria-label={`Floresce em: ${bloomText}`}>
              {MONTHS.map((l, i) => {
                const on = care.bloomMonths.includes(i + 1);
                return (
                  <div key={i} className="flex flex-col items-center gap-1">
                    <div className={`h-6 w-full border border-carimbo ${on ? "bg-carimbo" : ""}`} />
                    <span className="typed text-[0.65rem]">{l}</span>
                  </div>
                );
              })}
            </div>
            {bloomFrom && <InheritedNote from={bloomFrom} />}
          </section>

          <div className="mx-5 mt-5 max-w-prose space-y-3 text-lg leading-relaxed">
            <Section title="Luz" text={care.light} from={inheritedFrom("light")} />
            <Section title="Rega" text={care.watering} from={inheritedFrom("watering")} />
            <Section title="Adubação" text={care.fertilizing} from={inheritedFrom("fertilizing")} />
            <Section title="Substrato e vaso" text={care.substrate} from={inheritedFrom("substrate")} />
            <Section title="Repouso" text={care.restPeriod} from={inheritedFrom("restPeriod")} />
            <Section title="Observações" text={s.notes} from={null} />
          </div>
        </>
      ) : (
        <p className="mx-5 mt-4 max-w-prose text-lg text-pontilhado">
          Ainda não há ficha de cultivo para este táxon nem para os níveis acima dele.
        </p>
      )}

      {s.children.length > 0 && (
        <section className="mx-5 mt-7" aria-label="Táxons abaixo">
          <h2 className="border-b border-sepia pb-1 text-lg font-medium">
            Abaixo de <TaxonName lineage={s.lineage} />
            <span className="typed ml-2 text-[0.8rem]">{s.children.length}</span>
          </h2>
          <ul>
            {s.children.map((c) => (
              <li key={c.id} className="border-b border-dotted border-linha">
                <Link to={`/guia/${c.id}`} className="flex items-baseline justify-between gap-3 py-2.5">
                  <TaxonName lineage={[...s.lineage, c]} className="min-w-0 truncate text-lg" />
                  <span className="typed shrink-0 text-[0.75rem]">{RANK_LABEL[c.rank]}</span>
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
    <p className="text-[0.9rem] text-pontilhado">
      herdado de <TaxonName lineage={from} />
    </p>
  );
}

function Section({ title, text, from }: { title: string; text: string | null; from: TaxonRef[] | null }) {
  if (!text) return null;
  return (
    <section>
      <h2 className="text-[0.95rem] font-semibold tracking-wide [font-variant:small-caps]">{title}</h2>
      <p>{text}</p>
      {from && <InheritedNote from={from} />}
    </section>
  );
}
