import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { Input, PageHeader } from "../components/ui.tsx";
import { api, type Species } from "../lib/api.ts";

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function Guide() {
  const [q, setQ] = useState("");
  const list = useQuery({
    queryKey: ["species", q],
    queryFn: () => api.get<Species[]>(`/species${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  });
  return (
    <main>
      <PageHeader title="Guia de Cultivo" />
      <div className="px-4">
        <Input type="search" placeholder="Buscar gênero ou espécie" value={q} onChange={(e) => setQ(e.target.value)} />
        <ul className="mt-4 divide-y divide-linha">
          {list.data?.map((s) => (
            <li key={s.id}>
              <Link to={`/guia/${s.id}`} className="block py-3">
                <span className="taxon text-lg">{s.displayName}</span>
                {s.commonNames.length > 0 && <span className="block text-sm text-musgo-2">{s.commonNames.join(", ")}</span>}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}

const range = (a: number | null, b: number | null, unit: string) =>
  a == null && b == null ? "—" : `${a ?? "?"}–${b ?? "?"} ${unit}`;

export function SpeciesSheet() {
  const { id } = useParams();
  const s = useQuery({ queryKey: ["species", "one", id], queryFn: () => api.get<Species>(`/species/${id}`) }).data;
  if (!s) return null;

  return (
    <main className="px-4 pb-8">
      <PageHeader title={<span className="taxon">{s.displayName}</span>} />
      <dl className="grid grid-cols-2 gap-3">
        <Stat label="Dia" value={range(s.tempDayMin, s.tempDayMax, "°C")} />
        <Stat label="Noite" value={range(s.tempNightMin, s.tempNightMax, "°C")} />
        <Stat label="Umidade do ar" value={range(s.humidityMin, s.humidityMax, "%")} />
        <Stat label="Floração" value={s.bloomMonths.length ? s.bloomMonths.map((m) => MONTHS[m - 1]).join(", ") : "—"} />
      </dl>
      <div className="mt-6 max-w-prose space-y-4">
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-etiqueta p-3">
      <dt className="text-sm text-musgo-2">{label}</dt>
      <dd className="text-lg font-semibold">{value}</dd>
    </div>
  );
}

function Section({ title, text }: { title: string; text: string | null }) {
  if (!text) return null;
  return (
    <section>
      <h2 className="font-semibold">{title}</h2>
      <p className="font-serif leading-relaxed">{text}</p>
    </section>
  );
}
