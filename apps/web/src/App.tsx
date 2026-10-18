import { Link, Navigate, NavLink, Outlet, Route, Routes, useLocation } from "react-router";
import { Brand } from "./components/Logo.tsx";
import { Icon } from "./components/ui.tsx";
import { useMe } from "./lib/auth.tsx";
import { Collection } from "./routes/Collection.tsx";
import { EditPlant } from "./routes/EditPlant.tsx";
import { Guide, TaxonPage } from "./routes/Guide.tsx";
import { Login } from "./routes/Login.tsx";
import { NewPlant } from "./routes/NewPlant.tsx";
import { PlantDetail } from "./routes/PlantDetail.tsx";
import { Settings } from "./routes/Settings.tsx";

export function App() {
  const me = useMe();
  if (me.isPending) return <div className="typed p-6">Abrindo o herbário…</div>;
  if (!me.data) return <Login />;

  return (
    <Routes>
      <Route element={<Shell isMaster={me.data.role === "master"} name={me.data.name} />}>
        <Route index element={<Collection />} />
        <Route path="plantas/nova" element={<NewPlant />} />
        <Route path="plantas/:id" element={<PlantDetail />} />
        <Route path="plantas/:id/editar" element={<EditPlant />} />
        <Route path="guia" element={<Guide />} />
        <Route path="guia/:id" element={<TaxonPage />} />
        <Route path="configuracoes" element={me.data.role === "master" ? <Settings /> : <Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

function Shell({ isMaster, name }: { isMaster: boolean; name: string }) {
  const tab = ({ isActive }: { isActive: boolean }) =>
    `relative flex min-h-14 flex-1 flex-col items-center justify-center gap-1 rounded-lg text-[0.72rem] transition-colors ${
      isActive
        ? "bg-salvia-clara/80 font-medium text-tinta after:absolute after:-bottom-0.5 after:h-0.5 after:w-4 after:rounded-full after:bg-folhagem"
        : "text-musgo"
    }`;
  return (
    <div className="mx-auto min-h-dvh max-w-2xl pb-[calc(4.75rem+env(safe-area-inset-bottom))]">
      <header className="flex h-[4.5rem] items-center justify-between border-b border-linha px-5">
        <Link to="/" aria-label="Orchidiary, ir para a coleção">
          <Brand />
        </Link>
        <span
          className="grid size-8 place-items-center rounded-full border border-contorno bg-salvia-clara font-serif text-[0.95rem] text-folhagem"
          title={name}
          aria-hidden="true"
        >
          {name.trim().charAt(0).toUpperCase() || "·"}
        </span>
      </header>
      <div key={useLocation().pathname} className="pagina">
        <Outlet />
      </div>
      <nav
        aria-label="Navegação principal"
        className="fixed inset-x-0 bottom-0 z-10 border-t border-linha bg-papel/95 px-4 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] backdrop-blur-md"
      >
        <div className="mx-auto flex max-w-2xl gap-1">
          <NavLink to="/" end className={tab}>
            <Icon name="collection" className="size-[1.2rem]" />
            Coleção
          </NavLink>
          <NavLink to="/guia" className={tab}>
            <Icon name="guide" className="size-[1.2rem]" />
            Guia de Cultivo
          </NavLink>
          {isMaster && (
            <NavLink to="/configuracoes" className={tab}>
              <Icon name="settings" className="size-[1.2rem]" />
              Ajustes
            </NavLink>
          )}
        </div>
      </nav>
    </div>
  );
}
