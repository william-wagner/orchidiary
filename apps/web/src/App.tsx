import { Link, Navigate, NavLink, Outlet, Route, Routes, useLocation } from "react-router";
import { Brand } from "./components/Logo.tsx";
import { AccountTab } from "./components/AccountTab.tsx";
import { ToastProvider } from "./components/Toast.tsx";
import { Icon, tabCls } from "./components/ui.tsx";
import type { User } from "./lib/api.ts";
import { useMe } from "./lib/auth.tsx";
import { Account } from "./routes/Account.tsx";
import { Collection } from "./routes/Collection.tsx";
import { EditPlant } from "./routes/EditPlant.tsx";
import { Guide, TaxonPage } from "./routes/Guide.tsx";
import { Login } from "./routes/Login.tsx";
import { NewPlace } from "./routes/NewPlace.tsx";
import { NewPlant } from "./routes/NewPlant.tsx";
import { PlaceDetailPage } from "./routes/PlaceDetail.tsx";
import { Places } from "./routes/Places.tsx";
import { PlantDetail } from "./routes/PlantDetail.tsx";
import { Roadmap } from "./routes/Roadmap.tsx";
import { Settings } from "./routes/Settings.tsx";

export function App() {
  const me = useMe();
  if (me.isPending) return <div className="typed p-6">Abrindo o herbário…</div>;
  if (!me.data) return <Login />;

  return (
    <Routes>
      <Route element={<Shell user={me.data} />}>
        <Route index element={<Collection />} />
        <Route path="plantas/nova" element={<NewPlant />} />
        <Route path="plantas/:id" element={<PlantDetail />} />
        <Route path="plantas/:id/editar" element={<EditPlant />} />
        <Route path="lugares" element={<Places />} />
        <Route path="lugares/novo" element={<NewPlace />} />
        <Route path="lugares/:id" element={<PlaceDetailPage />} />
        <Route path="guia" element={<Guide />} />
        <Route path="guia/:id" element={<TaxonPage />} />
        <Route path="roadmap" element={<Roadmap />} />
        <Route path="conta" element={<Account user={me.data} />} />
        <Route path="configuracoes" element={me.data.role === "master" ? <Settings /> : <Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

function Shell({ user }: { user: User }) {
  return (
    <ToastProvider>
      <div className="mx-auto min-h-dvh max-w-2xl pb-[calc(6.5rem+env(safe-area-inset-bottom))]">
        <header className="flex h-[4.5rem] items-center border-b border-linha px-5">
          <Link to="/" aria-label="Orchidiary, ir para a coleção">
            <Brand />
          </Link>
        </header>
        <div key={useLocation().pathname} className="pagina">
          <Outlet />
        </div>
        {/* Barra flutuante: uma cápsula de papel solta do rodapé */}
        <nav
          aria-label="Navegação principal"
          className="pointer-events-none fixed inset-x-0 bottom-0 z-10 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
        >
          <div className="pointer-events-auto mx-auto flex max-w-md gap-1 rounded-full border border-linha bg-folha/90 p-1.5 shadow-caderno backdrop-blur-md">
            <NavLink to="/" end className={tabCls}>
              <Icon name="collection" className="size-[1.2rem]" />
              Coleção
            </NavLink>
            <NavLink to="/lugares" className={tabCls}>
              <Icon name="pin" className="size-[1.2rem]" />
              Lugares
            </NavLink>
            <NavLink to="/guia" className={tabCls}>
              <Icon name="guide" className="size-[1.2rem]" />
              Guia
            </NavLink>
            <AccountTab user={user} />
          </div>
        </nav>
      </div>
    </ToastProvider>
  );
}
