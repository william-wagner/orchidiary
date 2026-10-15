import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, type ReactNode, useState } from "react";
import { useSearchParams } from "react-router";
import { Button, ErrorText, Field, Input, PageHeader, Select } from "../components/ui.tsx";
import { api } from "../lib/api.ts";
import { useLogout } from "../lib/auth.tsx";
import { typedDate } from "../lib/format.ts";

interface IntegrationView<C> {
  enabled: boolean;
  configured: boolean;
  config: C | null;
  hasSecrets: Record<string, boolean>;
}
interface Integrations {
  telegram: IntegrationView<{ chatId: string }>;
  googleDrive: IntegrationView<{
    clientId: string;
    folderId?: string;
    weekday: number;
    hour: number;
    keepLast: number;
    connectedEmail?: string;
  }> & { redirectUri: string };
  openai: IntegrationView<{ model: string; quality: "low" | "medium" | "high" }>;
  secretsKeyConfigured: boolean;
}
interface BackupRun {
  id: string;
  trigger: string;
  status: "running" | "success" | "error";
  startedAt: string;
  sizeBytes: number | null;
  error: string | null;
}

const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

/** Tela exclusiva do usuário master. */
export function Settings() {
  const data = useQuery({ queryKey: ["integrations"], queryFn: () => api.get<Integrations>("/settings/integrations") });
  const logout = useLogout();
  const [params] = useSearchParams();
  const driveStatus = params.get("drive");

  return (
    <main className="pb-10">
      <PageHeader kicker="Somente o usuário master" title="Ajustes" />
      <div className="space-y-6 px-4 pt-5">
      {driveStatus === "ok" && <Notice tone="ok">Google Drive conectado. O backup semanal está ativo.</Notice>}
      {driveStatus === "erro" && <Notice tone="error">Não foi possível conectar o Google Drive. Confira o Client ID, o Client Secret e o endereço de retorno.</Notice>}
      {data.data && !data.data.secretsKeyConfigured && (
        <Notice tone="error">Defina SECRETS_KEY no arquivo .env do servidor para salvar as integrações.</Notice>
      )}
      {data.data && (
        <>
          <TelegramCard view={data.data.telegram} />
          <DriveCard view={data.data.googleDrive} />
          <BackupsCard connected={!!data.data.googleDrive.hasSecrets.refreshToken} />
          <IllustrationCard view={data.data.openai} />
        </>
      )}
      <Button variant="quiet" onClick={logout} className="w-full">
        Sair
      </Button>
      </div>
    </main>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="herb-label space-y-4 p-4">
      <h2 className="border-b border-sepia pb-1 text-xl font-medium">{title}</h2>
      {children}
    </section>
  );
}

function Notice({ tone, children }: { tone: "ok" | "error"; children: ReactNode }) {
  return (
    <p className={`border-[1.5px] p-3 ${tone === "ok" ? "border-prensada text-sepia" : "border-alerta text-alerta"}`}>{children}</p>
  );
}

function TelegramCard({ view }: { view: Integrations["telegram"] }) {
  const qc = useQueryClient();
  const [enabled, setEnabled] = useState(view.enabled);
  const save = useMutation({
    mutationFn: (body: unknown) => api.put("/settings/telegram", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["integrations"] }),
  });
  const test = useMutation({ mutationFn: () => api.post("/settings/telegram/test") });

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    save.mutate({ enabled, chatId: f.get("chatId"), botToken: f.get("botToken") || undefined });
  }

  return (
    <Card title="Alertas no Telegram">
      <p className="text-pontilhado">
        Crie um bot com o @BotFather, envie uma mensagem para ele e use o seu chat id (o @userinfobot mostra o número).
      </p>
      <form onSubmit={onSubmit} className="space-y-3">
        <Field label="Token do bot" hint={view.hasSecrets.botToken ? "Já salvo. Deixe em branco para manter." : undefined}>
          <Input name="botToken" type="password" autoComplete="off" />
        </Field>
        <Field label="Chat id">
          <Input name="chatId" defaultValue={view.config?.chatId ?? ""} required inputMode="numeric" />
        </Field>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="size-5" />
          Enviar alertas
        </label>
        <ErrorText error={save.error ?? test.error} />
        {test.isSuccess && <p className="typed text-[0.85rem]">Mensagem de teste enviada.</p>}
        <div className="grid grid-cols-2 gap-2">
          <Button type="submit" disabled={save.isPending}>
            Salvar
          </Button>
          <Button type="button" variant="quiet" onClick={() => test.mutate()} disabled={!view.configured || test.isPending}>
            Enviar teste
          </Button>
        </div>
      </form>
    </Card>
  );
}

function DriveCard({ view }: { view: Integrations["googleDrive"] }) {
  const qc = useQueryClient();
  const cfg = view.config;
  const [enabled, setEnabled] = useState(view.enabled);
  const refresh = () => qc.invalidateQueries({ queryKey: ["integrations"] });
  const save = useMutation({ mutationFn: (body: unknown) => api.put("/settings/google-drive", body), onSuccess: refresh });
  const connect = useMutation({
    mutationFn: () => api.get<{ url: string }>("/settings/google-drive/connect"),
    onSuccess: ({ url }) => window.location.assign(url),
  });
  const disconnect = useMutation({ mutationFn: () => api.post("/settings/google-drive/disconnect"), onSuccess: refresh });

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    save.mutate({
      enabled,
      clientId: f.get("clientId"),
      clientSecret: f.get("clientSecret") || undefined,
      weekday: Number(f.get("weekday")),
      hour: Number(f.get("hour")),
      keepLast: Number(f.get("keepLast")),
    });
  }

  const connected = !!view.hasSecrets.refreshToken;

  return (
    <Card title="Backup no Google Drive">
      <details className="text-pontilhado">
        <summary className="cursor-pointer text-sepia underline underline-offset-4">Como criar o acesso no Google</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>No Google Cloud Console, crie um projeto e ative a Google Drive API.</li>
          <li>Em "Tela de consentimento OAuth", escolha Externo e adicione seu e-mail como usuário de teste.</li>
          <li>Em "Credenciais", crie um ID do cliente OAuth do tipo Aplicativo da Web.</li>
          <li>
            Em "URIs de redirecionamento autorizados", cole: <code className="typed break-all text-[0.85rem]">{view.redirectUri}</code>
          </li>
          <li>Copie o Client ID e o Client Secret para cá, salve e toque em Conectar.</li>
        </ol>
      </details>

      <form onSubmit={onSubmit} className="space-y-3">
        <Field label="Client ID">
          <Input name="clientId" defaultValue={cfg?.clientId ?? ""} required autoComplete="off" />
        </Field>
        <Field label="Client Secret" hint={view.hasSecrets.clientSecret ? "Já salvo. Deixe em branco para manter." : undefined}>
          <Input name="clientSecret" type="password" autoComplete="off" />
        </Field>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Dia">
            <Select name="weekday" defaultValue={cfg?.weekday ?? 0}>
              {WEEKDAYS.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Hora">
            <Select name="hour" defaultValue={cfg?.hour ?? 3}>
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, "0")}h
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Guardar">
            <Select name="keepLast" defaultValue={cfg?.keepLast ?? 8}>
              {[4, 8, 12, 26, 52].map((n) => (
                <option key={n} value={n}>
                  {n} últimos
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="size-5" />
          Backup semanal ativo
        </label>
        <ErrorText error={save.error ?? connect.error} />
        <Button type="submit" disabled={save.isPending} className="w-full">
          Salvar
        </Button>
      </form>

      {connected ? (
        <div className="flex items-center justify-between gap-3 border border-dotted border-sepia p-3">
          <p>
            Conectado{cfg?.connectedEmail ? ` como ${cfg.connectedEmail}` : ""}. Os arquivos ficam na pasta Orchidiary.
          </p>
          <Button variant="quiet" onClick={() => disconnect.mutate()}>
            Desconectar
          </Button>
        </div>
      ) : (
        <Button variant="quiet" onClick={() => connect.mutate()} disabled={!view.hasSecrets.clientSecret} className="w-full">
          Conectar conta Google
        </Button>
      )}
    </Card>
  );
}

const QUALITIES = [
  { value: "low", label: "Rascunho (mais barata)" },
  { value: "medium", label: "Normal" },
  { value: "high", label: "Detalhada (mais cara)" },
];

function IllustrationCard({ view }: { view: Integrations["openai"] }) {
  const qc = useQueryClient();
  const [enabled, setEnabled] = useState(view.enabled);
  const save = useMutation({
    mutationFn: (body: unknown) => api.put("/settings/openai", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["integrations"] }),
  });

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    save.mutate({ enabled, apiKey: f.get("apiKey") || undefined, model: f.get("model"), quality: f.get("quality") });
  }

  return (
    <Card title="Pranchas botânicas">
      <p className="text-pontilhado">
        A foto de capa de cada planta é redesenhada como uma prancha de livro de botânica pela API de imagens da OpenAI. A
        foto original continua guardada no diário. Cada prancha é cobrada pela OpenAI e só é feita quando a capa muda.
      </p>
      <form onSubmit={onSubmit} className="space-y-3">
        <Field label="Chave da API" hint={view.hasSecrets.apiKey ? "Já salva. Deixe em branco para manter." : undefined}>
          <Input name="apiKey" type="password" autoComplete="off" />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Modelo">
            <Input name="model" defaultValue={view.config?.model ?? "gpt-image-2"} required autoComplete="off" />
          </Field>
          <Field label="Qualidade">
            <Select name="quality" defaultValue={view.config?.quality ?? "medium"}>
              {QUALITIES.map((q) => (
                <option key={q.value} value={q.value}>
                  {q.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="size-5" />
          Desenhar as capas
        </label>
        <ErrorText error={save.error} />
        {save.isSuccess && enabled && (
          <p className="typed text-[0.85rem]">Salvo. As capas sem prancha entram na fila, uma de cada vez.</p>
        )}
        <Button type="submit" disabled={save.isPending} className="w-full">
          Salvar
        </Button>
      </form>
    </Card>
  );
}

function BackupsCard({ connected }: { connected: boolean }) {
  const qc = useQueryClient();
  const runs = useQuery({ queryKey: ["backups"], queryFn: () => api.get<BackupRun[]>("/settings/backup/runs") });
  const run = useMutation({
    mutationFn: () => api.post<{ ok: boolean; error?: string }>("/settings/backup/run"),
    onSettled: () => qc.invalidateQueries({ queryKey: ["backups"] }),
  });
  return (
    <Card title="Backups">
      <Button onClick={() => run.mutate()} disabled={!connected || run.isPending} className="w-full">
        {run.isPending ? "Fazendo backup…" : "Fazer backup agora"}
      </Button>
      {run.data && !run.data.ok && <p className="text-alerta">{run.data.error}</p>}
      {runs.data?.length === 0 && <p className="text-pontilhado">Nenhum backup feito ainda.</p>}
      <ul className="divide-y divide-dotted divide-linha">
        {runs.data?.map((r) => (
          <li key={r.id} className="flex justify-between gap-3 py-2">
            <span>
              <span className="typed text-[0.85rem]">{typedDate(r.startedAt)}</span>
              {r.trigger === "manual" ? ", manual" : ""}
            </span>
            <span className={r.status === "error" ? "stamp border-alerta text-alerta" : r.status === "success" ? "stamp" : "typed text-[0.8rem]"} title={r.error ?? undefined}>
              {r.status === "success"
                ? `OK${r.sizeBytes ? `, ${Math.max(1, Math.round(r.sizeBytes / 1024))} KB` : ""}`
                : r.status === "error"
                  ? "Falhou"
                  : "Em andamento"}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
