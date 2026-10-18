import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Brand } from "../components/Logo.tsx";
import { Button, ErrorText, Field, Icon, Input } from "../components/ui.tsx";
import { api, type User } from "../lib/api.ts";

/**
 * Página inicial: a abertura do caderno. No celular, o texto fica sobre o céu
 * da ilustração e o formulário logo abaixo; em telas largas, lado a lado.
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

  return (
    <main className="flex min-h-dvh flex-col bg-salvia md:grid md:grid-cols-[minmax(0,46%)_minmax(0,54%)] md:bg-papel">
      {/* Texto de abertura */}
      <section className="relative z-[1] px-6 pt-8 md:flex md:flex-col md:px-[clamp(2rem,6vw,6rem)] md:pt-12">
        <Brand size="lg" />
        <h1 className="mt-10 text-[3.3rem] leading-[1.02] tracking-[-0.045em] md:mt-[14vh] md:text-[clamp(3.4rem,5.4vw,5rem)]">
          Cultive
          <br />
          <em className="text-folhagem">o seu melhor.</em>
        </h1>
        <p className="mt-4 font-serif text-[1.15rem] text-musgo italic">Herbário pessoal de orquídeas</p>

        <LoginForm onSubmit={onSubmit} busy={busy} error={error} className="mt-10 hidden max-w-sm md:block" />
      </section>

      {/* Ilustração: a jornada de quem cultiva */}
      <div className="relative -mt-4 min-h-[21rem] flex-1 md:mt-0 md:min-h-dvh">
        <img
          src="/jornada.webp"
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-[50%_58%] [mask-image:linear-gradient(transparent,#000_22%)] md:[mask-image:none]"
        />
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-b from-transparent to-salvia md:hidden" aria-hidden="true" />
      </div>

      {/* Formulário no celular, na faixa de sálvia abaixo da ilustração */}
      <section className="bg-salvia px-6 pt-2 pb-[calc(1.75rem+env(safe-area-inset-bottom))] md:hidden">
        <LoginForm onSubmit={onSubmit} busy={busy} error={error} />
      </section>
    </main>
  );
}

function LoginForm({
  onSubmit,
  busy,
  error,
  className = "",
}: {
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  busy: boolean;
  error: unknown;
  className?: string;
}) {
  return (
    <form onSubmit={onSubmit} className={`space-y-4 ${className}`}>
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
