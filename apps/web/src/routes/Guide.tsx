import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { Input, PageHeader } from "../components/ui.tsx";
import { api, type Species } from "../lib/api.ts";

const MONTHS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const MONTH_NAMES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

export function Guide() {
  const [q, setQ] = useState("");
  const list = useQuery({
    queryKey: ["species", q],
    queryFn: () => api.get<Species[]>(`/species${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  });
  const n = list.data?.length ?? 0;
  return (
    <main>
      <PageHeader kicker={list.data ? `${n} ${n === 1 ? "ficha" : "fichas"}` : " "} title="Guia de Cultivo" />
      <div className="px-4 pt-4">
        <Input
          type="search"
          aria-label="Buscar no guia"
          placeholder="Buscar gênero ou espécie"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <ul className="mt-3">
          {list.data?.map((s) => (
            <li key={s.id} className="border-b border-dotted border-linha">
              <Link to={`/guia/${s.id}`} className="block py-3">
                <span className="taxon block text-xl leading-tight">{s.displayName}</span>
                {s.commonNames.length > 0 && <span className="block text-pontilhado">{s.commonNames.join(", ")}</span>}
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

export function SpeciesSheet() {
  const { id } = useParams();
  const s = useQuery({ queryKey: ["species", "one", id], queryFn: () => api.get<Species>(`/species/${id}`) }).data;
  if (!s) return <p className="typed p-6">Abrindo a ficha…</p>;

  const ranges = [
    { k: "Temperatura de dia", v: range(s.tempDayMin, s.tempDayMax, "°C") },
    { k: "Temperatura à noite", v: range(s.tempNightMin, s.tempNightMax, "°C") },
    { k: "Umidade do ar", v: range(s.humidityMin, s.humidityMax, "%") },
  ];
  const bloomText = s.bloomMonths.length ? s.bloomMonths.map((m) => MONTH_NAMES[m - 1]).join(", ") : "sem registro";

  return (
    <main className="pb-8">
      <div className="px-4 pt-3">
        <Link to="/guia" className="inline-flex min-h-11 items-center">
          Guia de Cultivo
        </Link>
      </div>

      <header className="mx-5 border-b-[3px] border-double border-sepia pb-3">
        <p>
          Orchidaceae{s.commonNames.length > 0 ? `, conhecida como ${s.commonNames.join(" ou ")}` : ""}
        </p>
        <h1 className="taxon mt-1 text-[2.4rem] leading-[1.05]">{s.displayName}</h1>
      </header>

      <dl className="mx-5 mt-4 flex flex-col gap-1.5 text-lg">
        {ranges.map((r) => (
          <div key={r.k} className="flex items-baseline gap-1.5">
            <dt className="whitespace-nowrap">{r.k}</dt>
            <span className="leader" aria-hidden="true" />
            <dd className="typed text-[0.92rem] whitespace-nowrap">{r.v}</dd>
          </div>
        ))}
      </dl>

      <section className="mx-5 mt-5" aria-label="Época de floração">
        <h2 className="mb-1.5 text-lg font-medium">Época de floração</h2>
        <div className="grid grid-cols-12 gap-[3px]" role="img" aria-label={`Floresce em: ${bloomText}`}>
          {MONTHS.map((l, i) => {
            const on = s.bloomMonths.includes(i + 1);
            return (
              <div key={i} className="flex flex-col items-center gap-1">
                <div className={`h-6 w-full border border-carimbo ${on ? "bg-carimbo" : ""}`} />
                <span className="typed text-[0.65rem]">{l}</span>
              </div>
            );
          })}
        </div>
      </section>

      <div className="mx-5 mt-5 max-w-prose space-y-3 text-lg leading-relaxed">
        <Section title="Luz" text={s.light} />
        <Section title="Rega" text={s.watering} />
        <Section title="Adubação" text={s.fertilizing} />
        <Section title="Substrato e vaso" text={s.substrate} />
        <Section title="Repouso" text={s.restPeriod} />
        <Section title="Observações" text={s.notes} />
      </div>
    </main>
  );
}

function Section({ title, text }: { title: string; text: string | null }) {
  if (!text) return null;
  return (
    <section>
      <h2 className="text-[0.95rem] font-semibold tracking-wide [font-variant:small-caps]">{title}</h2>
      <p>{text}</p>
    </section>
  );
}
