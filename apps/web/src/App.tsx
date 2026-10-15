import { Navigate, NavLink, Outlet, Route, Routes } from "react-router";
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
      <Route element={<Shell isMaster={me.data.role === "master"} />}>
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

function Shell({ isMaster }: { isMaster: boolean }) {
  const tab = ({ isActive }: { isActive: boolean }) =>
    `flex min-h-14 flex-1 items-center justify-center text-lg ${
      isActive ? "text-carimbo underline decoration-1 underline-offset-[5px]" : "text-sepia"
    }`;
  return (
    <div className="mx-auto min-h-dvh max-w-xl pb-[calc(3.5rem+env(safe-area-inset-bottom))]">
      <Outlet />
      <nav
        aria-label="Navegação principal"
        className="fixed inset-x-0 bottom-0 border-t border-sepia bg-papel pb-[env(safe-area-inset-bottom)]"
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
