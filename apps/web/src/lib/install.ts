import { useSyncExternalStore } from "react";

/** Evento não padronizado do Chromium: o navegador oferece instalar o PWA. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let offered: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

// Registrado na carga do módulo: o evento pode disparar antes de qualquer tela montar
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  offered = e as BeforeInstallPromptEvent;
  notify();
});
window.addEventListener("appinstalled", () => {
  offered = null;
  notify();
});

/** Devolve `install` só enquanto o navegador oferece a instalação (e o app ainda não está instalado). */
export function useInstallPrompt() {
  const event = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => offered,
  );
  if (!event) return null;
  return async () => {
    await event.prompt();
    await event.userChoice;
    offered = null; // o evento só pode ser usado uma vez
    notify();
  };
}
