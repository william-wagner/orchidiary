import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Brand, ClockMark } from "../components/Logo.tsx";
import { Button, ErrorText, Field, Icon, Input } from "../components/ui.tsx";
import { api, type User } from "../lib/api.ts";

/**
 * Página inicial: a abertura do caderno. Cabe sempre na altura da tela, sem
 * barra de rolagem.
 *
 * Provisório: variações da diagramação lateral para escolher no seletor do
 * canto. Quando uma for definida, as outras e o seletor saem daqui.
 */
const LAYOUTS = [
  { id: "duas", label: "Duas linhas" },
  { id: "uma", label: "Uma linha" },
  { id: "cartao", label: "Em cartão" },
  { id: "invertida", label: "Invertida" },
] as const;
type LayoutId = (typeof LAYOUTS)[number]["id"];

const STORAGE_KEY = "orchidiary:login-layout";

function readLayout(): LayoutId {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    const found = LAYOUTS.find((l) => l.id === saved);
    if (found) return found.id;
  } catch {
    // sem armazenamento: usa o padrão
  }
  return "duas";
}

export function Login() {
  const qc = useQueryClient();
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [layout, setLayout] = useState<LayoutId>(readLayout);

  function chooseLayout(id: LayoutId) {
    setLayout(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // sem armazenamento: vale só nesta visita
    }
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const user = await api.post<User>("/auth/login", { email: form.get("email"), password: form.get("password") });
      qc.setQueryData(["me"], user);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Lateral variant={layout} onSubmit={onSubmit} busy={busy} error={error} />
      <LayoutPicker value={layout} onChange={chooseLayout} />
    </>
  );
}

type FormProps = { onSubmit: (e: FormEvent<HTMLFormElement>) => void; busy: boolean; error: unknown };

/**
 * A jornada de quem cultiva, atravessando as quatro estações em 20 quadros (2 s, em loop).
 * O quadro 01 parado fica por baixo enquanto a animação carrega, e é o que aparece para quem pede menos movimento.
 */
function Journey({ className = "" }: { className?: string }) {
  return (
    <div className={`overflow-hidden bg-[url(/jornada.webp)] bg-cover bg-[50%_58%] ${className}`}>
      <picture>
        <source media="(prefers-reduced-motion: reduce)" srcSet="/jornada.webp" />
        <img
          src="/jornada-ciclo.webp"
          alt=""
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover object-[50%_58%]"
        />
      </picture>
    </div>
  );
}

/**
 * Texto e formulário de um lado, a ilustração do outro. No celular, a
 * ilustração fica entre a etiqueta e o formulário, e o céu da própria
 * animação sobe por trás da etiqueta (ver .ceu em styles.css).
 *
 * - duas: título em duas linhas, grande.
 * - uma: título numa linha só.
 * - cartao: título numa linha, formulário num cartão de caderno.
 * - invertida: título numa linha, ilustração à esquerda.
 */
function Lateral({ variant, ...form }: FormProps & { variant: LayoutId }) {
  const umaLinha = variant !== "duas";
  const emCartao = variant === "cartao";
  const invertida = variant === "invertida";

  const title = umaLinha ? (
    <h1 className="mt-5 max-md:hidden text-[clamp(1.6rem,8.2vw,2.4rem)] leading-[1.04] tracking-[-0.04em] whitespace-nowrap md:mt-0 md:text-[clamp(1.9rem,min(2.9vw,6dvh),3.2rem)]">
      Cultive <em className="text-folhagem">o seu melhor.</em>
    </h1>
  ) : (
    <h1 className="mt-5 max-md:hidden text-[clamp(2.4rem,7.5dvh,3.3rem)] leading-[1.02] tracking-[-0.045em] md:mt-0 md:text-[clamp(3.4rem,min(5.4vw,9dvh),5rem)]">
      Cultive
      <br />
      <em className="text-folhagem">o seu melhor.</em>
    </h1>
  );

  return (
    <main
      className={`relative flex h-dvh flex-col overflow-hidden bg-salvia md:grid ${
        invertida ? "md:grid-cols-[minmax(0,56%)_minmax(0,44%)]" : "md:grid-cols-[minmax(0,44%)_minmax(0,56%)]"
      } ${emCartao ? "md:bg-salvia-clara" : "md:bg-papel"}`}
    >
      <div
        className="ceu pointer-events-none absolute inset-x-0 top-0 h-[62dvh] [mask-image:linear-gradient(#000_50%,transparent)] md:hidden"
        aria-hidden="true"
      />

      <section className="relative z-[1] flex shrink-0 flex-col px-6 pt-6 md:h-dvh md:px-[clamp(2rem,5vw,5rem)] md:pt-10 md:pb-10">
        <SpecimenLabel className="md:hidden" />
        <div className="max-md:hidden">
          <Brand size="lg" animated />
        </div>
        <div className="md:flex md:flex-1 md:flex-col md:justify-center">
          {emCartao ? (
            <div className="md:rounded-[10px] md:border md:border-linha md:bg-folha md:p-[clamp(1.5rem,3vw,2.5rem)] md:shadow-caderno">
              {title}
              <LoginForm {...form} className="mt-8 hidden md:block" />
            </div>
          ) : (
            <>
              {title}
              <LoginForm {...form} className="mt-8 hidden max-w-sm md:block" />
            </>
          )}
        </div>
      </section>

      <div className={`relative -mt-7 min-h-0 flex-1 md:mt-0 md:h-dvh ${invertida ? "md:-order-1" : ""}`}>
        <Journey className="absolute inset-0 [mask-image:linear-gradient(transparent,#000_14%)] md:[mask-image:none]" />
        <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-b from-transparent to-salvia md:hidden" aria-hidden="true" />
      </div>

      <section className="shrink-0 bg-salvia px-6 pt-1 pb-[calc(1.25rem+env(safe-area-inset-bottom))] md:hidden">
        <LoginForm {...form} compact />
      </section>
    </main>
  );
}

/**
 * Celular: a etiqueta de herbário com a marca e o slogan, presa um pouco
 * torta sobre a ilustração. O slogan vem como uma nota escrita à mão.
 */
function SpecimenLabel({ className = "" }: { className?: string }) {
  return (
    <div className={`-rotate-[1.2deg] border border-musgo/45 bg-folha p-[5px] shadow-caderno ${className}`}>
      <div className="flex flex-col gap-2.5 border border-linha px-4 pt-3.5 pb-3">
        <div className="flex items-center gap-3.5">
          <ClockMark className="size-12 shrink-0" animated />
          <div className="min-w-0">
            <p className="eyebrow">Herbário pessoal · Nº 001</p>
            <p className="font-serif text-[2.2rem] leading-none tracking-[-0.02em]">Orchidiary</p>
          </div>
        </div>
        <div className="flex items-baseline gap-2.5 border-t border-dashed border-contorno pt-2">
          <span className="eyebrow">Nota:</span>
          {/* ! vence a regra base de h1 em styles.css, que fica fora das camadas */}
          <h1 className="font-mao! text-[1.6rem] leading-[1.2]! text-tinta">Cultive o seu melhor.</h1>
        </div>
      </div>
    </div>
  );
}

/** Seletor provisório das diagramações (só muda algo a partir do tablet). */
function LayoutPicker({ value, onChange }: { value: LayoutId; onChange: (id: LayoutId) => void }) {
  return (
    <div
      role="group"
      aria-label="Versão da tela de entrada"
      className="fixed top-3 right-3 z-30 hidden items-center gap-0.5 rounded-full border border-linha bg-folha/90 p-1 shadow-caderno backdrop-blur-sm md:flex"
    >
      {LAYOUTS.map((l, i) => (
        <button
          key={l.id}
          type="button"
          onClick={() => onChange(l.id)}
          aria-pressed={value === l.id}
          className={`typed flex h-8 items-center gap-1.5 rounded-full px-3 text-[0.74rem] transition-colors ${
            value === l.id ? "bg-tinta !text-folha" : "hover:bg-salvia-clara"
          }`}
        >
          {i + 1}
          <span className="hidden sm:inline">{l.label}</span>
        </button>
      ))}
    </div>
  );
}

function LoginForm({
  onSubmit,
  busy,
  error,
  className = "",
  compact = false,
}: FormProps & {
  className?: string;
  /** Campos e espaçamentos mais enxutos, para caber em telas baixas. */
  compact?: boolean;
}) {
  const fields = compact ? "[&_input]:min-h-11 [&_label>span]:mb-1" : "";
  return (
    <form onSubmit={onSubmit} className={`${compact ? "space-y-3" : "space-y-4"} ${fields} ${className}`}>
      <Field label="E-mail">
        <Input name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Senha">
        <Input name="password" type="password" autoComplete="current-password" required />
      </Field>
      <ErrorText error={error} />
      <Button type="submit" disabled={busy} className="w-full">
        Abrir o herbário
        <Icon name="arrow-right" className="size-[1.1rem]" />
      </Button>
    </form>
  );
}
