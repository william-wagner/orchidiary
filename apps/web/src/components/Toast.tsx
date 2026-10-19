import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";

export interface ToastAction {
  label: string;
  run: () => void;
}

export interface ToastInput {
  message: string;
  actions?: ToastAction[];
  /** Quanto tempo fica na tela, em ms */
  duration?: number;
}

const ToastContext = createContext<(t: ToastInput) => void>(() => {});

/** Aviso que aparece acima da barra de navegação, com ações curtas ("Desfazer"). Um por vez. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<(ToastInput & { key: number }) | null>(null);
  const show = useCallback((t: ToastInput) => setToast({ ...t, key: Date.now() }), []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.duration ?? 6000);
    return () => clearTimeout(timer);
  }, [toast]);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(6rem+env(safe-area-inset-bottom))] z-30 flex justify-center px-4"
      >
        {toast && (
          <div
            key={toast.key}
            className="pagina pointer-events-auto flex w-full max-w-md items-center justify-between gap-3 rounded-xl bg-tinta py-2.5 pr-2.5 pl-4 text-[0.88rem] text-folha shadow-caderno"
          >
            <span className="min-w-0">{toast.message}</span>
            {!!toast.actions?.length && (
              <span className="flex shrink-0 gap-1">
                {toast.actions.map((a) => (
                  <button
                    key={a.label}
                    onClick={() => {
                      setToast(null);
                      a.run();
                    }}
                    className="min-h-10 rounded-md px-2.5 font-semibold text-salvia active:bg-folha/15"
                  >
                    {a.label}
                  </button>
                ))}
              </span>
            )}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
