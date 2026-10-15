import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Button, ErrorText, Field, Input } from "../components/ui.tsx";
import { api, type User } from "../lib/api.ts";

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
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <img src="/icon.svg" alt="" className="mb-6 size-16" />
      <h1 className="font-serif text-4xl font-semibold">Orchidiary</h1>
      <p className="mt-2 mb-8 text-musgo-2">O diário das suas orquídeas.</p>
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="E-mail">
          <Input name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label="Senha">
          <Input name="password" type="password" autoComplete="current-password" required />
        </Field>
        <ErrorText error={error} />
        <Button type="submit" disabled={busy} className="w-full">
          Entrar
        </Button>
      </form>
    </main>
  );
}
