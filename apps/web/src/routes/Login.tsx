import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Brand } from "../components/Logo.tsx";
import { Button, ErrorText, Field, Icon, Input } from "../components/ui.tsx";
import { api, type User } from "../lib/api.ts";

/**
 * Página inicial: a abertura do caderno. Cabe sempre na altura da tela, sem
 * barra de rolagem.
 */
export function Login() {
  const qc = useQueryClient();
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

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

  return <Lateral onSubmit={onSubmit} busy={busy} error={error} />;
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
 * Título (numa linha só) e formulário de um lado, a ilustração do outro. No
 * celular, a ilustração fica entre o título e o formulário.
 */
function Lateral(form: FormProps) {
  return (
    <main className="fixed inset-0 flex flex-col overflow-hidden overscroll-none bg-salvia md:grid md:grid-cols-[minmax(0,44%)_minmax(0,56%)] md:bg-papel">
      <section className="relative z-[1] flex shrink-0 flex-col px-6 pt-6 md:h-full md:px-[clamp(2rem,5vw,5rem)] md:pt-10 md:pb-10">
        <Brand size="lg" animated />
        <div className="md:flex md:flex-1 md:flex-col md:justify-center">
          <h1 className="mt-5 text-[clamp(1.6rem,8.2vw,2.4rem)] leading-[1.04] tracking-[-0.04em] whitespace-nowrap md:mt-0 md:text-[clamp(1.9rem,min(2.9vw,6dvh),3.2rem)]">
            Cultive <em className="text-folhagem">o seu melhor.</em>
          </h1>
          <LoginForm {...form} className="mt-8 hidden max-w-sm md:block" />
        </div>
      </section>

      <div className="relative -mt-4 min-h-0 flex-1 md:mt-0 md:h-full">
        <Journey className="absolute inset-0 [mask-image:linear-gradient(transparent,#000_22%)] md:[mask-image:none]" />
        <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-b from-transparent to-salvia md:hidden" aria-hidden="true" />
      </div>

      <section className="shrink-0 bg-salvia px-6 pt-1 pb-[calc(1.25rem+env(safe-area-inset-bottom))] md:hidden">
        <LoginForm {...form} compact />
      </section>
    </main>
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
