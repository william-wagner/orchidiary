import { Navigate, NavLink, Outlet, Route, Routes } from "react-router";
import { useMe } from "./lib/auth.tsx";
import { Collection } from "./routes/Collection.tsx";
import { Guide, SpeciesSheet } from "./routes/Guide.tsx";
import { Login } from "./routes/Login.tsx";
import { NewPlant } from "./routes/NewPlant.tsx";
import { PlantDetail } from "./routes/PlantDetail.tsx";
import { Settings } from "./routes/Settings.tsx";

export function App() {
  const me = useMe();
  if (me.isPending) return <div className="p-6 text-musgo-2">Carregando…</div>;
  if (!me.data) return <Login />;

  return (
    <Routes>
      <Route element={<Shell isMaster={me.data.role === "master"} />}>
        <Route index element={<Collection />} />
        <Route path="plantas/nova" element={<NewPlant />} />
        <Route path="plantas/:id" element={<PlantDetail />} />
        <Route path="guia" element={<Guide />} />
        <Route path="guia/:id" element={<SpeciesSheet />} />
        <Route path="configuracoes" element={me.data.role === "master" ? <Settings /> : <Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

function Shell({ isMaster }: { isMaster: boolean }) {
  const tab = ({ isActive }: { isActive: boolean }) =>
    `flex-1 py-3 text-center text-sm font-semibold ${isActive ? "text-labelo" : "text-musgo-2"}`;
  return (
    <div className="mx-auto min-h-dvh max-w-xl pb-[calc(4rem+env(safe-area-inset-bottom))]">
      <Outlet />
      <nav
        aria-label="Navegação principal"
        className="fixed inset-x-0 bottom-0 border-t border-linha bg-velame/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
      >
        <div className="mx-auto flex max-w-xl">
          <NavLink to="/" end className={tab}>
            Coleção
          </NavLink>
          <NavLink to="/guia" className={tab}>
            Guia de Cultivo
          </NavLink>
          {isMaster && (
            <NavLink to="/configuracoes" className={tab}>
              Ajustes
            </NavLink>
          )}
        </div>
      </nav>
    </div>
  );
}
