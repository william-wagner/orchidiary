import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

/**
 * Componentes base da identidade "Herbário".
 * primary = sépia sólido; quiet = contorno sépia; stamp = contorno violeta (ações de registro).
 */
export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "quiet" | "stamp" }) {
  const look = {
    primary: "bg-sepia text-papel active:opacity-85",
    quiet: "border border-sepia bg-transparent text-sepia active:bg-etiqueta",
    stamp: "border-[1.5px] border-carimbo bg-transparent text-carimbo active:bg-etiqueta",
  }[variant];
  return <button className={`min-h-12 px-4 text-lg disabled:opacity-45 ${look} ${className}`} {...props} />;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[0.95rem] text-pontilhado">{hint}</span>}
    </label>
  );
}

const inputCls =
  "w-full min-h-12 border border-linha bg-etiqueta px-3 font-mono text-[0.95rem] text-tinta placeholder:text-pontilhado/70 focus:border-sepia";

export const Input = (props: InputHTMLAttributes<HTMLInputElement>) => <input className={inputCls} {...props} />;
export const Select = (props: SelectHTMLAttributes<HTMLSelectElement>) => <select className={inputCls} {...props} />;

/** Cabeçalho de página: linha de dado datilografado acima do título e filete sépia abaixo. */
export function PageHeader({ title, kicker, action }: { title: ReactNode; kicker?: ReactNode; action?: ReactNode }) {
  return (
    <header className="mx-4 flex items-end justify-between gap-4 border-b border-sepia pt-7 pb-3">
      <div className="min-w-0">
        {kicker && <p className="typed text-[0.82rem]">{kicker}</p>}
        <h1 className="text-[2.25rem] leading-tight font-medium">{title}</h1>
      </div>
      {action}
    </header>
  );
}

export function ErrorText({ error }: { error: unknown }) {
  if (!error) return null;
  return <p className="text-alerta">{error instanceof Error ? error.message : String(error)}</p>;
}

/** Desenho de orquídea prensada, usado quando a planta ainda não tem foto. */
export function PressedOrchid({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 46 70"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      className={`text-prensada ${className}`}
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
