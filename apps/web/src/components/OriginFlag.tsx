import { originLabel, type TaxonOrigin } from "@orchidiary/shared";

/**
 * Bandeiras dos países de `ORIGIN_COUNTRIES`, embutidas no app (emoji de bandeira não aparece no
 * Windows). A lista do glob precisa acompanhar a de `packages/shared/src/origin.ts`; um teste de lá confere.
 */
const FLAGS = import.meta.glob<string>(
  "../../node_modules/country-flag-icons/3x2/{AR,AU,BD,BN,BO,BR,BS,BT,BZ,CA,CD,CL,CM,CN,CO,CR,CU,DE,DO,EC,ES,ET,FJ,FR,GA,GB,GR,GT,GY,HN,HT,ID,IN,IT,JM,JP,KE,KH,KM,KR,LA,LK,MG,MM,MU,MX,MY,MZ,NI,NP,NZ,PA,PE,PG,PH,PR,PT,PY,SB,SG,SR,SV,TH,TT,TW,TZ,UG,US,UY,VE,VN,VU,ZA,ZW}.svg",
  { eager: true, query: "?url", import: "default" },
);

const flagUrl = (code: string) => FLAGS[`../../node_modules/country-flag-icons/3x2/${code}.svg`];

/**
 * Origem do táxon logo depois do nome: a bandeira do país principal e "+N" quando ocorre em mais
 * países (todos os nomes no title), um mundo com "?" quando ninguém sabe de onde vem, ou dois ramos
 * que se juntam quando é cruzamento (não há país para mostrar).
 */
export function OriginFlag({ origin, className = "" }: { origin: TaxonOrigin; className?: string }) {
  const label = originLabel(origin);
  const base = `inline-block h-[0.8em] shrink-0 align-baseline ${className}`;
  if (origin.kind === "country") {
    const main = origin.countries[0]!;
    const others = origin.countries.length - 1;
    const src = flagUrl(main.code);
    return (
      <span role="img" aria-label={label} title={label} className={`inline-flex shrink-0 items-baseline gap-1 whitespace-nowrap ${className}`}>
        {src ? (
          <img src={src} alt="" className="inline-block h-[0.8em] w-auto self-center border border-sepia/40" />
        ) : (
          <span className="typed text-[0.7em]">{main.code}</span>
        )}
        {others > 0 && <span className="typed text-[0.6em] text-pontilhado">+{others}</span>}
      </span>
    );
  }
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`${base} aspect-square h-[0.95em] ${origin.kind === "cross" ? "text-prensada" : "text-pontilhado"}`}
    >
      <title>{label}</title>
      {origin.kind === "cross" ? (
        <>
          <path d="M5 3c0 7 7 6 7 12" />
          <path d="M19 3c0 7-7 6-7 12" />
          <path d="M12 15v6" />
          <path d="M9.5 18.5L12 21l2.5-2.5" />
        </>
      ) : (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h4M17 12h4M12 3c-2.5 2.5-3 6-3 9M12 21c-2.5-2.5-3-6-3-9" opacity="0.45" />
          <path d="M10 10a2 2 0 1 1 2.8 1.8c-.6.3-.8.7-.8 1.4" />
          <path d="M12 16.2v.1" />
        </>
      )}
    </svg>
  );
}
