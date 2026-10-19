import { useId } from "react";

/**
 * O Relógio: mostrador verde com ponteiros em forma de folha. O ponteiro
 * longo, cor de orquídea, ultrapassa o mostrador (o crescimento que passa
 * do tempo), e a parte dele que fica por dentro vira papel. Um aro fino,
 * como o traço de um caderno botânico, contorna o mostrador.
 *
 * As cores vêm de variáveis de styles.css para funcionar nos dois temas.
 * Com `animated`, os ponteiros giram ao aparecer e assentam na posição do logo.
 */
export function ClockMark({
  className = "",
  title,
  animated = false,
}: {
  className?: string;
  title?: string;
  animated?: boolean;
}) {
  const clip = useId();
  const longo = animated ? "ponteiro ponteiro-longo" : undefined;
  const curto = animated ? "ponteiro ponteiro-curto" : undefined;
  const leaf = "M0 0C13 -11 31 -11 44 0C31 11 13 11 0 0Z";
  const bud = "M0 0C7 -7 15 -7 22 0C15 7 7 7 0 0Z";
  return (
    <svg
      viewBox="12 6 82 82"
      className={className}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <defs>
        <clipPath id={clip}>
          <circle cx="50" cy="52" r="30" />
        </clipPath>
      </defs>
      <circle cx="50" cy="52" r="35.5" fill="none" stroke="var(--logo-aro)" strokeWidth="0.9" />
      <circle cx="50" cy="52" r="30" fill="var(--logo-mostrador)" />
      <g className={longo}>
        <path transform="translate(50 52) rotate(-55)" d={leaf} fill="var(--logo-flor)" />
      </g>
      <g clipPath={`url(#${clip})`}>
        <g className={longo}>
          <path transform="translate(50 52) rotate(-55)" d={leaf} fill="var(--logo-papel)" />
        </g>
      </g>
      <g className={curto}>
        <path transform="translate(50 52) rotate(200)" d={bud} fill="var(--logo-broto)" />
      </g>
      <circle cx="50" cy="52" r="2.6" fill="var(--logo-papel)" />
    </svg>
  );
}

/** Marca com o nome, para o topo das páginas. */
export function Brand({ size = "md", animated = false }: { size?: "md" | "lg"; animated?: boolean }) {
  const lg = size === "lg";
  return (
    <span className="flex items-center gap-2.5">
      <ClockMark className={lg ? "size-11" : "size-9"} animated={animated} />
      <span className={`font-serif leading-none tracking-[-0.02em] ${lg ? "text-[1.85rem]" : "text-[1.6rem]"}`}>
        Orchidiary
      </span>
    </span>
  );
}
