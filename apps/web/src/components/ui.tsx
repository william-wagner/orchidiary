import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

/**
 * Componentes base da identidade "Caderno botânico".
 * primary = tinta verde sólida; quiet = contorno suave; stamp = destaque em orquídea (ações de registro).
 */
export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "quiet" | "stamp" }) {
  return <button className={`${buttonCls(variant)} ${className}`} {...props} />;
}

/** As mesmas classes do Button, para links com cara de botão. */
export function buttonCls(variant: "primary" | "quiet" | "stamp" = "primary") {
  const look = {
    primary: "bg-tinta text-folha active:bg-tinta-viva",
    quiet: "border border-contorno bg-transparent text-tinta active:bg-salvia-clara",
    stamp: "bg-lilas text-orquidea active:opacity-85",
  }[variant];
  return `inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-5 text-[0.95rem] font-medium transition-colors disabled:opacity-45 ${look}`;
}

/** Item da barra flutuante de navegação (App e AccountTab). */
export const tabCls = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-13 flex-1 flex-col items-center justify-center gap-0.5 rounded-full text-[0.7rem] transition-colors ${
    isActive ? "bg-salvia font-medium text-tinta" : "text-musgo active:bg-salvia-clara"
  }`;

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-mono text-[0.74rem] tracking-[0.02em] text-folhagem">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-[0.82rem] text-musgo">{hint}</span>}
    </label>
  );
}

export const inputCls =
  "w-full min-h-12 rounded-md border border-contorno bg-folha px-3 text-[0.95rem] text-tinta placeholder:text-musgo/70 focus:border-tinta focus:outline-none";

export const Input = (props: InputHTMLAttributes<HTMLInputElement>) => <input className={inputCls} {...props} />;
export const Select = (props: SelectHTMLAttributes<HTMLSelectElement>) => <select className={inputCls} {...props} />;
export const Textarea = (props: TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea className={`${inputCls} py-2.5`} {...props} />
);

/** Interruptor com texto ao lado (no lugar das caixas de seleção). */
export function Toggle({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4">
      <span>{children}</span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="chave" />
    </label>
  );
}

/** Cabeçalho de página: rótulo pequeno em caixa-alta, título em serifa e ação à direita. */
export function PageHeader({ title, kicker, action }: { title: ReactNode; kicker?: ReactNode; action?: ReactNode }) {
  return (
    <header className="mx-5 flex items-end justify-between gap-4 pt-6 pb-5">
      <div className="min-w-0">
        {kicker && <p className="eyebrow">{kicker}</p>}
        <h1 className="mt-1.5 text-[2.4rem] leading-[1.05] tracking-[-0.03em]">{title}</h1>
      </div>
      {action}
    </header>
  );
}

/** Link de volta, discreto, com seta. */
export function BackLink({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex min-h-11 items-center gap-2 text-[0.9rem] text-musgo">
      <Icon name="arrow-left" className="size-4" />
      {children}
    </span>
  );
}

export function ErrorText({ error }: { error: unknown }) {
  if (!error) return null;
  return <p className="text-alerta">{error instanceof Error ? error.message : String(error)}</p>;
}

/** Desenho de orquídea em traço fino, usado quando a planta ainda não tem foto. */
export function PressedOrchid({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 46 70"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.1"
      strokeLinecap="round"
      className={`text-folhagem ${className}`}
      aria-hidden="true"
    >
      <path d="M23 68 C22 52 24 40 23 26" />
      <path d="M23 60 C12 58 6 50 4 44 C12 46 20 50 23 56" />
      <path d="M23 56 C33 52 40 46 42 40 C34 41 27 46 23 52" />
      <path d="M23 26 C17 16 15 10 17 4 C21 10 23 18 23 26" />
      <path d="M23 26 C29 16 31 10 29 4 C25 10 23 18 23 26" />
      <path d="M23 26 C13 24 8 20 6 14 C13 15 19 20 23 26" />
      <path d="M23 26 C33 24 38 20 40 14 C33 15 27 20 23 26" />
      <path d="M19 30 C21 36 25 36 27 30" />
    </svg>
  );
}

const ICONS = {
  collection: (
    <>
      <rect x="3.5" y="4" width="17" height="16" rx="2" />
      <path d="M3.5 9h17M12 9v11" />
    </>
  ),
  guide: (
    <>
      <path d="M5 19c7 0 13-6 13-14C10 5 5 10 5 19Z" />
      <path d="M5 19 13 11" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" />
    </>
  ),
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z" />,
  monitor: (
    <>
      <rect x="3.5" y="4.5" width="17" height="12" rx="2" />
      <path d="M9 20h6M12 16.5V20" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.6 2.6 3.5 5.5 3.5 8.5s-.9 5.9-3.5 8.5c-2.6-2.6-3.5-5.5-3.5-8.5s.9-5.9 3.5-8.5Z" />
    </>
  ),
  logout: <path d="M10 4.5H6.5a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1H10M15 8l4 4-4 4M19 12H9.5" />,
  download: <path d="M12 4v11M7 11l5 5 5-5M5 19.5h14" />,
  plus: <path d="M12 5v14M5 12h14" />,
  "arrow-left": <path d="M19 12H5M11 6l-6 6 6 6" />,
  "arrow-right": <path d="M5 12h14M13 6l6 6-6 6" />,
  chevron: <path d="m9 6 6 6-6 6" />,
  pin: (
    <>
      <path d="M12 21s-6.5-5.4-6.5-11a6.5 6.5 0 0 1 13 0c0 5.6-6.5 11-6.5 11Z" />
      <circle cx="12" cy="10" r="2.3" />
    </>
  ),
  camera: (
    <>
      <path d="M4 8.5h3l1.6-2.5h6.8L17 8.5h3V19H4Z" />
      <circle cx="12" cy="13.3" r="3.3" />
    </>
  ),
  image: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="2" />
      <path d="m3.5 16 5-4.5 4 3.5 3-2.5 5 4" />
      <circle cx="15.5" cy="9.5" r="1.4" />
    </>
  ),
  drop: <path d="M12 3.5s6 6.4 6 10.8a6 6 0 0 1-12 0C6 9.9 12 3.5 12 3.5Z" />,
  sprout: (
    <>
      <path d="M12 21v-9" />
      <path d="M12 12c0-4 3-6.5 7.5-6.5 0 4.4-3 6.5-7.5 6.5ZM12 14.5c0-3.3-2.5-5.5-6.5-5.5 0 3.6 2.5 5.5 6.5 5.5Z" />
    </>
  ),
  flower: (
    <>
      <circle cx="12" cy="12" r="2.2" />
      <path d="M12 9.8C10 6 10.5 3.5 12 3.5s2 2.5 0 6.3ZM14.2 12c3.8-2 6.3-1.5 6.3 0s-2.5 2-6.3 0ZM12 14.2c2 3.8 1.5 6.3 0 6.3s-2-2.5 0-6.3ZM9.8 12C6 14 3.5 13.5 3.5 12S6 10 9.8 12Z" />
    </>
  ),
  thermometer: (
    <>
      <path d="M10 14.5V5a2 2 0 1 1 4 0v9.5a4 4 0 1 1-4 0Z" />
      <path d="M12 9v7" />
    </>
  ),
  note: (
    <>
      <path d="M6 3.5h9l3.5 3.5v13.5H6Z" />
      <path d="M9 11h6M9 15h6" />
    </>
  ),
} as const;

export type IconName = keyof typeof ICONS;

/** Ícones de traço fino, na cor do texto. */
export function Icon({ name, className = "size-5" }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
    >
      {ICONS[name]}
    </svg>
  );
}
