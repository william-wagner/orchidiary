import { Link } from "react-router";
import { Icon, type IconName, PageHeader } from "../components/ui.tsx";
import type { User } from "../lib/api.ts";
import { useLogout } from "../lib/auth.tsx";
import { useInstallPrompt } from "../lib/install.ts";
import { type ThemeChoice, useTheme } from "../lib/theme.ts";

const THEMES: { value: ThemeChoice; label: string; icon: IconName }[] = [
  { value: "auto", label: "Auto", icon: "monitor" },
  { value: "light", label: "Claro", icon: "sun" },
  { value: "dark", label: "Escuro", icon: "moon" },
];

const itemCls =
  "flex min-h-12 w-full items-center gap-3 px-5 text-left text-[0.95rem] text-tinta transition-colors active:bg-salvia-clara";

/** Tela da aba "Conta": perfil, tema, idioma, ajustes (master), instalar app e sair. */
export function Account({ user }: { user: User }) {
  const [theme, setTheme] = useTheme();
  const install = useInstallPrompt();
  const logout = useLogout();
  const initial = user.name.trim().charAt(0).toUpperCase() || "·";

  return (
    <main className="pb-10">
      <PageHeader title="Conta" />
      <div className="space-y-5 px-5">
        <section className="cartao flex items-center gap-4 p-5">
          <span
            className="grid size-14 shrink-0 place-items-center rounded-full border border-contorno bg-salvia-clara font-serif text-[1.6rem] leading-none text-folhagem"
            aria-hidden="true"
          >
            {initial}
          </span>
          <div className="min-w-0">
            <p className="truncate font-serif text-[1.35rem] leading-tight">{user.name}</p>
            <p className="typed mt-0.5 truncate text-[0.78rem]">{user.email}</p>
            {user.role === "master" && <span className="selo selo-flor mt-2">master</span>}
          </div>
        </section>

        <section className="cartao p-5">
          <p className="eyebrow mb-2">Tema</p>
          <div role="radiogroup" aria-label="Tema" className="flex gap-1 rounded-full border border-contorno p-0.5">
            {THEMES.map((t) => (
              <button
                key={t.value}
                type="button"
                role="radio"
                aria-checked={theme === t.value}
                onClick={() => setTheme(t.value)}
                className={`flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-full text-[0.85rem] transition-colors ${
                  theme === t.value ? "bg-tinta text-folha" : "text-musgo"
                }`}
              >
                <Icon name={t.icon} className="size-4" />
                {t.label}
              </button>
            ))}
          </div>
        </section>

        <section className="cartao divide-y divide-linha overflow-hidden">
          {/* Ainda não há tradução: o item fica visível, porém desativado */}
          <button type="button" disabled className={`${itemCls} cursor-not-allowed opacity-60`}>
            <Icon name="globe" className="size-[1.15rem] text-folhagem" />
            <span className="flex-1">Idioma</span>
            <span className="typed text-[0.78rem]">Português (Brasil)</span>
          </button>
          <Link to="/roadmap" className={itemCls}>
            <Icon name="history" className="size-[1.15rem] text-folhagem" />
            <span className="flex-1">Roadmap</span>
            <Icon name="chevron" className="size-4 text-musgo" />
          </Link>
          {user.role === "master" && (
            <Link to="/configuracoes" className={itemCls}>
              <Icon name="settings" className="size-[1.15rem] text-folhagem" />
              <span className="flex-1">Ajustes</span>
              <Icon name="chevron" className="size-4 text-musgo" />
            </Link>
          )}
          {install && (
            <button type="button" onClick={install} className={itemCls}>
              <Icon name="download" className="size-[1.15rem] text-folhagem" />
              Instalar app
            </button>
          )}
          <button type="button" onClick={logout} className={`${itemCls} text-alerta`}>
            <Icon name="logout" className="size-[1.15rem]" />
            Sair
          </button>
        </section>

        <p className="typed text-center text-[0.72rem]">Orchidiary v{__APP_VERSION__}</p>
      </div>
    </main>
  );
}
