import type { Environment } from "@orchidiary/shared";

const OPTIONS: Array<{ value: Environment; title: string; hint: string }> = [
  { value: "outdoor", title: "Ao ar livre", hint: "Varanda, quintal, jardim. O clima registrado vale para ela." },
  { value: "indoor", title: "Dentro de casa", hint: "O clima de fora fica só como referência; registre temperatura e umidade quando quiser." },
];

export function EnvironmentPicker({ value, onChange }: { value: Environment; onChange: (v: Environment) => void }) {
  return (
    <fieldset className="grid grid-cols-2 gap-2">
      <legend className="mb-1 font-medium">Onde ela vive</legend>
      {OPTIONS.map((o) => {
        const active = value === o.value;
        return (
          <label
            key={o.value}
            className={`cursor-pointer border p-3 ${active ? "border-sepia bg-etiqueta" : "border-linha"}`}
          >
            <input
              type="radio"
              name="environment"
              value={o.value}
              checked={active}
              onChange={() => onChange(o.value)}
              className="sr-only"
            />
            <span className="flex items-center gap-2 text-lg">
              <span
                className={`inline-block size-3 rounded-full border-[1.5px] border-carimbo ${active ? "bg-carimbo" : ""}`}
                aria-hidden="true"
              />
              {o.title}
            </span>
            <span className="mt-1 block text-[0.92rem] leading-snug text-pontilhado">{o.hint}</span>
          </label>
        );
      })}
    </fieldset>
  );
}
