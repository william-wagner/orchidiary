import { NavLink, useLocation } from "react-router";
import type { User } from "../lib/api.ts";
import { tabCls } from "./ui.tsx";

/** Aba "Conta" da barra flutuante: leva à tela Conta, com a inicial do usuário no lugar do ícone. */
export function AccountTab({ user }: { user: User }) {
  const { pathname } = useLocation();
  // Ajustes é aberto a partir da Conta, então a aba acende nessa tela também
  const active = pathname.startsWith("/conta") || pathname.startsWith("/configuracoes");
  const initial = user.name.trim().charAt(0).toUpperCase() || "·";

  return (
    <NavLink to="/conta" className={() => tabCls({ isActive: active })}>
      <span
        className={`grid size-[1.35rem] place-items-center rounded-full border bg-salvia-clara font-serif text-[0.72rem] leading-none text-folhagem ${
          active ? "border-tinta" : "border-contorno"
        }`}
        aria-hidden="true"
      >
        {initial}
      </span>
      Conta
    </NavLink>
  );
}
