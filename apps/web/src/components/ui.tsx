import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "quiet" }) {
  const look =
    variant === "primary"
      ? "bg-musgo text-velame active:bg-musgo-2"
      : "border border-linha bg-etiqueta text-musgo active:bg-velame-2";
  return (
    <button
      className={`min-h-11 rounded-xl px-4 font-semibold disabled:opacity-50 ${look} ${className}`}
      {...props}
    />
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-sm text-musgo-2">{hint}</span>}
    </label>
  );
}

const inputCls =
  "w-full min-h-11 rounded-lg border border-linha bg-etiqueta px-3 text-musgo placeholder:text-musgo-2/60";

export const Input = (props: InputHTMLAttributes<HTMLInputElement>) => <input className={inputCls} {...props} />;
export const Select = (props: SelectHTMLAttributes<HTMLSelectElement>) => <select className={inputCls} {...props} />;

export function PageHeader({ title, action }: { title: ReactNode; action?: ReactNode }) {
  return (
    <header className="flex items-end justify-between gap-4 px-4 pt-6 pb-4">
      <h1 className="font-serif text-3xl leading-tight font-semibold">{title}</h1>
      {action}
    </header>
  );
}

export function ErrorText({ error }: { error: unknown }) {
  if (!error) return null;
  return <p className="text-sm text-alerta">{error instanceof Error ? error.message : String(error)}</p>;
}
