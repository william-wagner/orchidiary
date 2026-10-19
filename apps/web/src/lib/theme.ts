import { useSyncExternalStore } from "react";

export type ThemeChoice = "auto" | "light" | "dark";

const KEY = "orchidiary:theme";
const BARRA = { light: "#F7F5EC", dark: "#161D19" } as const;

/** Lê a escolha salva; o armazenamento pode estar bloqueado (aba privada). */
function read(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "auto";
  } catch {
    return "auto";
  }
}

const listeners = new Set<() => void>();
let current = read();

/** Aplica no <html> e na cor da barra do navegador (theme-color). Em "auto" o CSS segue o sistema. */
export function applyTheme(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === "auto") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", choice);

  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
    const scheme = meta.media.includes("dark") ? "dark" : "light";
    meta.content = choice === "auto" ? BARRA[scheme] : BARRA[choice];
  });
}

export function setTheme(choice: ThemeChoice) {
  current = choice;
  try {
    if (choice === "auto") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    /* sem armazenamento: vale só nesta sessão */
  }
  applyTheme(choice);
  listeners.forEach((l) => l());
}

export function useTheme() {
  const choice = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
  );
  return [choice, setTheme] as const;
}
