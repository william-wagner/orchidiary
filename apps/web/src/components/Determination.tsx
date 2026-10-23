import { careParent, type CrossInput, type CrossSide, RANK_LABEL, receivedNameMatch } from "@orchidiary/shared";
import { useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { api, type Plant, type TaxonHit, type TaxonSummary } from "../lib/api.ts";
import { OriginFlag } from "./OriginFlag.tsx";
import { ancestorsLabel, PlantTaxon, TaxonName } from "./Taxon.tsx";
import { TaxonPicker, useDebounced } from "./TaxonPicker.tsx";
import { Button, Field, Input, inputCls } from "./ui.tsx";

/**
 * Determinação da planta no cadastro e na edição: um táxon do catálogo (Espécie, onde também
 * se escolhe o grex registrado) OU uma cruza (semente × pólen), nunca os dois.
 * Ver docs/estudos/cruza-no-tombamento.md.
 */

export type SideDraft = { mode: "taxon"; taxon: TaxonSummary | null } | { mode: "text"; text: string } | { mode: "unknown" };

export interface DeterminationDraft {
  isCross: boolean;
  taxon: TaxonSummary | null;
  seed: SideDraft;
  pollen: SideDraft;
  careFrom: CrossSide | null;
}

const emptySide: SideDraft = { mode: "taxon", taxon: null };

export const emptyDetermination: DeterminationDraft = { isCross: false, taxon: null, seed: emptySide, pollen: emptySide, careFrom: null };

/** O rascunho de uma planta existente. Parentais que vêm do grex não entram: são do catálogo. */
export function determinationOf(plant: Pick<Plant, "taxon" | "cross">): DeterminationDraft {
  const own = plant.cross?.source === "plant" ? plant.cross : null;
  const side = (s: NonNullable<Plant["cross"]>["seed"]): SideDraft =>
    s && "taxon" in s ? { mode: "taxon", taxon: s.taxon } : s ? { mode: "text", text: s.text } : { mode: "unknown" };
  return own
    ? { isCross: true, taxon: null, seed: side(own.seed), pollen: side(own.pollen), careFrom: own.careFrom }
    : { ...emptyDetermination, taxon: plant.taxon };
}

const sideInput = (s: SideDraft): CrossInput["seed"] =>
  s.mode === "taxon" && s.taxon ? { taxonId: s.taxon.id } : s.mode === "text" && s.text.trim() ? { text: s.text.trim() } : null;

/** O que vai para a API: `taxonId` ou `cross`, e o outro nulo (trocar um solta o outro). */
export function determinationBody(d: DeterminationDraft) {
  if (!d.isCross) return { taxonId: d.taxon?.id ?? null, cross: null };
  const seed = sideInput(d.seed);
  const pollen = sideInput(d.pollen);
  const careFrom = d.careFrom && (d.careFrom === "seed" ? seed : pollen) && "taxonId" in (d.careFrom === "seed" ? seed : pollen)! ? d.careFrom : null;
  return { taxonId: null, cross: { seed, pollen, careFrom } };
}

/** Os táxons de cada lado e a marca, para saber de qual parental vem a ficha. */
const careRef = (d: DeterminationDraft) => ({
  seedTaxonId: d.seed.mode === "taxon" ? (d.seed.taxon?.id ?? null) : null,
  pollenTaxonId: d.pollen.mode === "taxon" ? (d.pollen.taxon?.id ?? null) : null,
  careFrom: d.careFrom,
});

/** Táxon do catálogo com exatamente esse nome, mais específico que o atual (para sugerir a troca). */
export function useCatalogMatch(text: string, currentTaxonId: string | null) {
  const q = useDebounced(text.trim(), 300);
  const search = useQuery({
    queryKey: ["taxa", "search", q],
    queryFn: () => api.get<TaxonHit[]>(`/taxa?q=${encodeURIComponent(q)}&limit=12`),
    enabled: q.length >= 3,
    staleTime: 60_000,
  });
  return q.length >= 3 ? receivedNameMatch(q, search.data ?? [], currentTaxonId) : null;
}

const headerLabel = "block font-mono text-[0.74rem] tracking-[0.02em] text-folhagem";

export function DeterminationField({
  value,
  onChange,
  hadCross = false,
}: {
  value: DeterminationDraft;
  onChange: (d: DeterminationDraft) => void;
  /** A planta já tinha cruza própria: desligar pede confirmação */
  hadCross?: boolean;
}) {
  const switchId = useId();
  const group = useId();
  const [confirmOff, setConfirmOff] = useState(false);
  const toggle = (
    <label htmlFor={switchId} className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-[0.86rem] text-musgo">
      É uma cruza
      <input
        id={switchId}
        type="checkbox"
        className="chave scale-[0.86]"
        checked={value.isCross}
        onChange={(e) => {
          // táxon ou cruza: ligar limpa a Espécie; desligar uma cruza que já existia pede confirmação
          if (e.target.checked) onChange({ ...value, isCross: true, taxon: null });
          else if (hadCross) setConfirmOff(true);
          else onChange({ ...value, isCross: false });
        }}
      />
    </label>
  );
  const confirm = confirmOff && (
    <div role="alert" className="mb-2 space-y-2 rounded-lg bg-ocre-claro px-4 py-3 text-[0.92rem]">
      <p>Desligar apaga os parentais desta planta quando você salvar.</p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={() => {
            setConfirmOff(false);
            onChange({ ...value, isCross: false });
          }}
        >
          Desligar a cruza
        </Button>
        <Button type="button" variant="quiet" onClick={() => setConfirmOff(false)}>
          Manter
        </Button>
      </div>
    </div>
  );

  if (!value.isCross) {
    return <TaxonPicker value={value.taxon} onChange={(taxon) => onChange({ ...value, taxon })} aside={toggle} />;
  }

  const care = careParent(careRef(value));
  const setSide = (key: CrossSide, side: SideDraft) => onChange({ ...value, [key]: side });
  return (
    <div>
      <div className="mb-1 flex min-h-11 items-center justify-between gap-3">
        <span className={headerLabel}>
          Parentais <span className="text-musgo">· semente × pólen</span>
        </span>
        {toggle}
      </div>
      {confirm}
      <fieldset className="cartao space-y-2 px-4 pt-3 pb-4" aria-label="Parentais">
        <SideField which="seed" group={group} side={value.seed} onChange={(s) => setSide("seed", s)} care={care} onCare={() => onChange({ ...value, careFrom: "seed" })} />
        <div className="flex items-center gap-3 text-musgo before:flex-1 before:border-t before:border-dotted before:border-contorno after:flex-1 after:border-t after:border-dotted after:border-contorno">
          <button
            type="button"
            title="Trocar semente e pólen"
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-contorno bg-folha px-3 font-mono text-[0.72rem] text-tinta active:bg-salvia-clara"
            // a marca da ficha acompanha o parental, não o lado
            onClick={() =>
              onChange({
                ...value,
                seed: value.pollen,
                pollen: value.seed,
                careFrom: value.careFrom === "seed" ? "pollen" : value.careFrom === "pollen" ? "seed" : null,
              })
            }
          >
            ⇅ inverter
          </button>
        </div>
        <SideField which="pollen" group={group} side={value.pollen} onChange={(s) => setSide("pollen", s)} care={care} onCare={() => onChange({ ...value, careFrom: "pollen" })} />
        {care?.choosable && <p className="pt-1 text-[0.84rem] text-musgo">Toque no parental de onde vem a ficha de cultivo.</p>}
        {!care && (
          <p className="pt-1 text-[0.84rem] text-ocre">
            Nenhum parental no catálogo: a planta fica sem ficha de cultivo, sem faixa no gráfico e sem alertas de frio e calor.
          </p>
        )}
      </fieldset>
    </div>
  );
}

function SideField({
  which,
  group,
  side,
  onChange,
  care,
  onCare,
}: {
  which: CrossSide;
  /** `name` dos dois rádios (semente e pólen) */
  group: string;
  side: SideDraft;
  onChange: (s: SideDraft) => void;
  care: ReturnType<typeof careParent>;
  onCare: () => void;
}) {
  const radioId = useId();
  const textId = useId();
  const title = which === "seed" ? "Semente" : "Pólen";
  const symbol = which === "seed" ? "♀" : "♂";
  const match = useCatalogMatch(side.mode === "text" ? side.text : "", null);
  const exit = (label: string, next: SideDraft, quiet = false) => (
    <button type="button" className={`min-h-9 text-[0.84rem] ${quiet ? "text-musgo" : "text-orquidea"}`} onClick={() => onChange(next)}>
      {label}
    </button>
  );

  let body;
  if (side.mode === "unknown") {
    body = (
      <div className="flex min-h-12 items-center gap-3 rounded-md border border-dashed border-contorno px-3">
        <span className="w-4 text-center font-serif text-[1.3rem] text-musgo">?</span>
        <span className="flex-1 text-[0.9rem] text-musgo">Não sei {which === "seed" ? "a semente" : "o pólen"}</span>
        {exit("Informar", { mode: "taxon", taxon: null })}
      </div>
    );
  } else if (side.mode === "text") {
    body = (
      <>
        <Input
          id={textId}
          aria-label={`${title}: nome livre`}
          className={`${inputCls} font-serif italic`}
          maxLength={160}
          placeholder="como veio na etiqueta"
          value={side.text}
          autoFocus
          onChange={(e) => onChange({ mode: "text", text: e.target.value })}
        />
        {match && (
          <MatchHint taxon={match} action="Usar o do catálogo" onUse={() => onChange({ mode: "taxon", taxon: match })} />
        )}
        <div className="flex flex-wrap gap-x-4">
          {exit("Buscar no catálogo", { mode: "taxon", taxon: null })}
          {exit("Não sei", { mode: "unknown" }, true)}
        </div>
      </>
    );
  } else if (side.taxon) {
    const t = side.taxon;
    const on = care?.side === which;
    const content = (
      <>
        <span className="min-w-0">
          <TaxonName lineage={t.lineage} className="font-serif text-[1.1rem] leading-tight" /> <OriginFlag origin={t.origin} />
          <span className="typed block text-[0.74rem]">
            {RANK_LABEL[t.rank]}
            {t.lineage.length > 1 && ` · ${ancestorsLabel(t.lineage)}`}
          </span>
          {on ? (
            <span className="selo selo-flor mt-1.5">ficha de cultivo</span>
          ) : care?.choosable ? (
            <span className="mt-1.5 block font-mono text-[0.68rem] text-orquidea">usar a ficha deste</span>
          ) : null}
        </span>
        <button type="button" className="min-h-11 shrink-0 px-2 text-orquidea" onClick={() => onChange({ mode: "taxon", taxon: null })}>
          Trocar
        </button>
      </>
    );
    const box = `cartao flex items-start justify-between gap-3 px-3 py-2 ${on ? "border-orquidea shadow-[inset_0_0_0_1px_var(--orquidea)]" : ""}`;
    body = care?.choosable ? (
      // com os dois parentais no catálogo, tocar no card escolhe de qual vem a ficha
      <label htmlFor={radioId} className={`${box} relative cursor-pointer has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-orquidea`}>
        <input id={radioId} type="radio" name={group} className="sr-only" checked={on} onChange={onCare} />
        {content}
      </label>
    ) : (
      <div className={box}>{content}</div>
    );
  } else {
    body = (
      <>
        <TaxonPicker
          value={null}
          onChange={(taxon) => onChange({ mode: "taxon", taxon })}
          label={title}
          labelHidden
          hint={null}
          emptyHint="Nada no catálogo com esse nome. Use “Não está no catálogo”."
        />
        <div className="flex flex-wrap gap-x-4">
          {exit("Não está no catálogo", { mode: "text", text: "" })}
          {exit("Não sei", { mode: "unknown" }, true)}
        </div>
      </>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium">
          <span className="mr-1 font-serif text-orquidea">{symbol}</span>
          {title}
        </span>
        <span className="typed text-[0.7rem]">{which === "seed" ? "a mãe, que deu o fruto" : "o pai"}</span>
      </div>
      {body}
    </div>
  );
}

function MatchHint({ taxon, action, note, onUse }: { taxon: TaxonSummary; action: string; note?: string; onUse: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-salvia-clara px-3 py-2 text-[0.88rem]">
      <span>
        <TaxonName lineage={taxon.lineage} /> está no catálogo.{note && ` ${note}`}
      </span>
      <button type="button" className="min-h-10 rounded-lg border border-contorno px-3 text-[0.86rem] text-tinta active:bg-folha" onClick={onUse}>
        {action}
      </button>
    </div>
  );
}

/** "Como veio na etiqueta": o texto literal, que não muda a ficha; sugere o táxon quando bate com o catálogo. */
export function ReceivedNameField({
  value,
  onChange,
  determination,
  onUse,
}: {
  value: string;
  onChange: (text: string) => void;
  determination: DeterminationDraft;
  onUse: (taxon: TaxonSummary) => void;
}) {
  const match = useCatalogMatch(value, determination.isCross ? null : (determination.taxon?.id ?? null));
  return (
    <div className="space-y-2">
      <Field
        label="Como veio na etiqueta"
        hint="Opcional. O nome da plaquinha ou do vendedor, do jeito que veio, mesmo que esteja errado. Não muda a ficha de cultivo."
      >
        <Input name="receivedName" maxLength={160} placeholder="Ex.: Rntda. Sunshine" value={value} onChange={(e) => onChange(e.target.value)} />
      </Field>
      {match && (
        <MatchHint
          taxon={match}
          action="Usar como espécie"
          note={determination.isCross ? "Usar troca a cruza pelo táxon, e os parentais anotados saem." : undefined}
          onUse={() => onUse(match)}
        />
      )}
    </div>
  );
}

/** Como o nome vai ficar na ficha, enquanto a pessoa preenche. */
export function DeterminationPreview({ determination, receivedName }: { determination: DeterminationDraft; receivedName: string }) {
  const body = determinationBody(determination);
  const view = {
    taxon: determination.isCross ? null : determination.taxon,
    cross: body.cross
      ? {
          seed: sideView(determination.seed),
          pollen: sideView(determination.pollen),
        }
      : null,
    receivedName: receivedName.trim() || null,
  };
  if (!view.taxon && !view.cross) return null;
  return (
    <div className="cartao bg-prancha px-4 py-3">
      <p className="eyebrow">Na ficha vai ficar</p>
      <p className="mt-1 font-serif text-[1.4rem] leading-tight [overflow-wrap:anywhere]">
        <PlantTaxon plant={{ taxon: view.taxon, cross: view.cross && { id: "", source: "plant", careFrom: null, ...view.cross }, receivedName: view.receivedName }} />
      </p>
      {view.cross && !view.cross.seed && !view.cross.pollen && <p className="font-serif text-folhagem">parentais desconhecidos</p>}
    </div>
  );
}

const sideView = (s: SideDraft) => (s.mode === "taxon" && s.taxon ? { taxon: s.taxon } : s.mode === "text" && s.text.trim() ? { text: s.text.trim() } : null);
