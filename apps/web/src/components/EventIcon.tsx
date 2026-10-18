import type { ReactNode } from "react";

/**
 * Gravuras do livro de registro: traço fino e sem preenchimento, como as
 * ilustrações de uma exsicata (mesma linguagem do `PressedOrchid`).
 * Cor por família: cuidado e crescimento em verde de planta prensada,
 * problemas em terra queimada, dados de coleta em tinta.
 */
const GLYPHS: Record<string, { tone: string; draw: ReactNode }> = {
  photo: {
    tone: "text-tinta",
    draw: (
      <>
        <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
        <circle cx="12" cy="13" r="3.5" />
      </>
    ),
  },
  note: {
    tone: "text-tinta",
    draw: (
      <>
        <path d="M4 20l1-4L16 5a2.1 2.1 0 0 1 3 3L8 19z" />
        <path d="M14 7l3 3" />
      </>
    ),
  },
  reading: {
    tone: "text-tinta",
    draw: (
      <>
        <path d="M10 14.5V5a2 2 0 0 1 4 0v9.5a4 4 0 1 1-4 0z" />
        <path d="M12 9v7" />
        <path d="M16.5 7h2M16.5 10h2" />
      </>
    ),
  },
  moved: {
    tone: "text-tinta",
    draw: (
      <>
        <path d="M12 21C7 15 5.5 12 5.5 9.5a6.5 6.5 0 0 1 13 0C18.5 12 17 15 12 21z" />
        <circle cx="12" cy="9.5" r="2.2" />
      </>
    ),
  },
  watering: {
    tone: "text-prensada",
    draw: (
      <>
        <path d="M12 3C12 3 6 10 6 14.5a6 6 0 0 0 12 0C18 10 12 3 12 3z" />
        <path d="M9.2 15a3 3 0 0 0 2.3 2.8" />
      </>
    ),
  },
  fertilizing: {
    tone: "text-prensada",
    draw: (
      <>
        <circle cx="7.5" cy="18" r="1.7" />
        <circle cx="12" cy="18" r="1.7" />
        <circle cx="16.5" cy="18" r="1.7" />
        <circle cx="9.8" cy="13.4" r="1.7" />
        <circle cx="14.2" cy="13.4" r="1.7" />
        <circle cx="12" cy="8.8" r="1.7" />
      </>
    ),
  },
  repotting: {
    tone: "text-prensada",
    draw: (
      <>
        <path d="M4 11h16" />
        <path d="M5.5 11l1.2 8a1 1 0 0 0 1 .9h8.6a1 1 0 0 0 1-.9l1.2-8" />
        <path d="M12 11V6" />
        <path d="M12 8C9.5 8 8 6.5 7.5 4.5 10 4.5 11.8 5.8 12 8z" />
        <path d="M12 7C12 5 13.5 3.5 16 3.5 16 5.7 14.5 7 12 7z" />
      </>
    ),
  },
  bloom_start: {
    tone: "text-prensada",
    draw: (
      <>
        <circle cx="12" cy="11.5" r="1.7" />
        {[0, 72, 144, 216, 288].map((a) => (
          <ellipse key={a} cx="12" cy="6.2" rx="2.4" ry="3.4" transform={`rotate(${a} 12 11.5)`} />
        ))}
      </>
    ),
  },
  bloom_end: {
    tone: "text-prensada",
    draw: (
      <>
        <circle cx="11" cy="9.5" r="1.6" />
        {[-72, 0, 72].map((a) => (
          <ellipse key={a} cx="11" cy="4.6" rx="2.2" ry="3.1" transform={`rotate(${a} 11 9.5)`} />
        ))}
        <ellipse cx="17" cy="18.5" rx="1.5" ry="2.4" transform="rotate(-45 17 18.5)" />
        <path d="M11 11.5V21" />
      </>
    ),
  },
  new_growth: {
    tone: "text-prensada",
    draw: (
      <>
        <path d="M12 21v-9" />
        <path d="M12 14C8 14 6 11 6 8c4 0 6 2 6 6z" />
        <path d="M12 12c0-4 2-7 6-7 0 4-2 7-6 7z" />
        <path d="M6 21h12" />
      </>
    ),
  },
  new_root: {
    tone: "text-prensada",
    draw: (
      <>
        <path d="M12 3v6" />
        <path d="M12 9c0 4-3 6-5 11" />
        <path d="M12 9v12" />
        <path d="M12 9c0 4 3 6 5 11" />
        <path d="M9 15.5l-2.5-.5M15 15.5l2.5-.5" />
      </>
    ),
  },
  keiki: {
    tone: "text-prensada",
    draw: (
      <>
        <path d="M6 21V8" />
        <path d="M6 13c3 0 5.5-1.5 7-4" />
        <path d="M13 9c0-3 1.5-5 4.5-5 0 3-1.5 5-4.5 5z" />
        <path d="M13 9C11 9 9.5 7.8 9 6c2 0 3.7.8 4 3z" />
        <path d="M13 9v2.5M12 11l-1 1.5M14 11l1 1.5" />
      </>
    ),
  },
  pest: {
    tone: "text-alerta",
    draw: (
      <>
        <ellipse cx="12" cy="14" rx="4" ry="5.5" />
        <circle cx="12" cy="7" r="1.9" />
        <path d="M12 8.9v10.6" />
        <path d="M8.2 11.5L4.5 10M8 14.5H4M8.4 17.5L5 19.5" />
        <path d="M15.8 11.5L19.5 10M16 14.5h4M15.6 17.5L19 19.5" />
        <path d="M11 5.3L9.5 3M13 5.3L14.5 3" />
      </>
    ),
  },
  disease: {
    tone: "text-alerta",
    draw: (
      <>
        <path d="M5 19C4 10 10 4 20 4c0 10-6 16-15 15z" />
        <path d="M5 19L14 10" />
        <circle cx="13.5" cy="14.5" r="1.1" />
        <circle cx="9.5" cy="12" r="0.9" />
        <circle cx="16.2" cy="9" r="0.9" />
      </>
    ),
  },
  treatment: {
    tone: "text-alerta",
    draw: (
      <>
        <path d="M10 3h4" />
        <path d="M10.5 3v6.2L5.6 18.6a1.5 1.5 0 0 0 1.3 2.2h10.2a1.5 1.5 0 0 0 1.3-2.2L13.5 9.2V3" />
        <path d="M8 15h8" />
      </>
    ),
  },
};

/** Câmera, também usada no botão de fotografar. */
export function CameraIcon({ className = "" }: { className?: string }) {
  return <GlyphSvg className={className}>{GLYPHS.photo!.draw}</GlyphSvg>;
}

/** Ícone do tipo de registro (`photo`, `reading` ou o tipo do evento). */
export function EventIcon({ type, className = "" }: { type: string; className?: string }) {
  const glyph = GLYPHS[type] ?? GLYPHS.note!;
  return (
    <GlyphSvg className={`${glyph.tone} ${className}`}>{glyph.draw}</GlyphSvg>
  );
}

function GlyphSvg({ className, children }: { className: string; children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {children}
    </svg>
  );
}
