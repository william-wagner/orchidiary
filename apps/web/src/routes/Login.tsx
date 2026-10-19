import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Brand } from "../components/Logo.tsx";
import { Button, ErrorText, Field, Icon, Input } from "../components/ui.tsx";
import { api, type User } from "../lib/api.ts";

type FormProps = { onSubmit: (e: FormEvent<HTMLFormElement>) => void; busy: boolean; error: unknown };

/**
 * Página inicial: a abertura do caderno. Em telas largas, texto e formulário ao lado
 * da ilustração; no celular, tudo cabe na altura da tela, sem rolagem.
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

  const form = { onSubmit, busy, error };

  return (
    <>
      <Desktop {...form} />
      <Mobile {...form} />
    </>
  );
}

function Title({ className = "" }: { className?: string }) {
  return (
    <h1 className={`leading-[1.02] tracking-[-0.045em] ${className}`}>
      Cultive
      <br />
      <em className="text-folhagem">o seu melhor.</em>
    </h1>
  );
}

/**
 * A jornada de quem cultiva, atravessando as quatro estações em 20 quadros (2 s, em loop).
 * O quadro 01 parado fica por baixo enquanto a animação carrega, e é o que aparece para quem pede menos movimento.
 */
function Journey({ className = "", position = "50%_58%" }: { className?: string; position?: string }) {
  return (
    <div className={`overflow-hidden bg-[url(/jornada.webp)] bg-cover ${className}`} style={{ backgroundPosition: position.replace("_", " ") }}>
      <picture>
        <source media="(prefers-reduced-motion: reduce)" srcSet="/jornada.webp" />
        <img
          src="/jornada-ciclo.webp"
          alt=""
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
          style={{ objectPosition: position.replace("_", " ") }}
        />
      </picture>
    </div>
  );
}

/** Telas largas: texto e formulário à esquerda, ilustração à direita. */
function Desktop(form: FormProps) {
  return (
    <main className="hidden min-h-dvh grid-cols-[minmax(0,46%)_minmax(0,54%)] bg-papel md:grid">
      <section className="flex flex-col px-[clamp(2rem,6vw,6rem)] pt-12">
        <Brand size="lg" animated />
        <Title className="mt-[14vh] text-[clamp(3.4rem,5.4vw,5rem)]" />
        <LoginForm {...form} className="mt-10 max-w-sm" />
      </section>
      <Journey className="relative h-dvh w-full" />
    </main>
  );
}

/** Celular: tudo na altura da tela; título numa linha, formulário enxuto e a ilustração no espaço que sobra. */
function Mobile(form: FormProps) {
  return (
    <main className="flex h-dvh flex-col overflow-hidden bg-salvia md:hidden">
      <section className="relative z-[1] px-6 pt-[max(1.25rem,env(safe-area-inset-top))]">
        <Brand animated />
        <h1 className="mt-[2.5dvh] text-[clamp(1.9rem,5dvh,2.4rem)] leading-[1.05] tracking-[-0.04em]">
          Cultive <em className="text-folhagem">o seu melhor.</em>
        </h1>
      </section>
      <div className="relative -mt-4 min-h-0 flex-1">
        <Journey
          className="absolute inset-0 [mask-image:linear-gradient(transparent,#000_18%,#000_85%,transparent)]"
          position="50%_62%"
        />
      </div>
      <section className="px-6 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <LoginForm {...form} className="space-y-2.5" />
      </section>
    </main>
  );
}

function LoginForm({ onSubmit, busy, error, className = "space-y-4" }: FormProps & { className?: string }) {
  return (
    <form onSubmit={onSubmit} className={className}>
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
