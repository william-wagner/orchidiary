import type { Environment } from "@orchidiary/shared";

const OPTIONS: Array<{ value: Environment; title: string; hint: string }> = [
  { value: "outdoor", title: "Ao ar livre", hint: "Varanda, quintal, jardim. O clima registrado vale para ela." },
  { value: "indoor", title: "Dentro de casa", hint: "O clima externo é só referência; registre temperatura e umidade quando quiser." },
];

export function EnvironmentPicker({ value, onChange }: { value: Environment; onChange: (v: Environment) => void }) {
  return (
    <fieldset className="grid grid-cols-2 gap-2">
      <legend className="mb-1 text-sm font-semibold">Onde ela vive</legend>
      {OPTIONS.map((o) => (
        <label
          key={o.value}
          className={`cursor-pointer rounded-xl border p-3 ${value === o.value ? "border-musgo bg-etiqueta" : "border-linha"}`}
        >
          <input
            type="radio"
            name="environment"
            value={o.value}
            checked={value === o.value}
            onChange={() => onChange(o.value)}
            className="sr-only"
          />
          <span className="block font-semibold">{o.title}</span>
          <span className="mt-1 block text-sm text-musgo-2">{o.hint}</span>
        </label>
      ))}
    </fieldset>
  );
}
