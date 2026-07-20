import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Bell,
  Building2,
  CalendarDays,
  ClipboardPlus,
  FileClock,
  Footprints,
  History,
  Home,
  LogOut,
  Menu,
  NotebookPen,
  Search,
  Settings,
  Stethoscope,
  Users,
  WalletCards
} from "lucide-react";
import { Button } from "../ui/Button";
import { Select } from "../ui/Field";
import { useAuth } from "../../context/AuthContext";
import { BranchProvider, useBranch } from "../../context/BranchContext";
import { ROLE_LABELS } from "../../constants";
import { TableSkeleton } from "../ui/Skeleton";
import { getDashboardData } from "../../services/dashboard";

const navItems = [
  { to: "/", label: "Inicio", icon: Home },
  { to: "/pacientes", label: "Pacientes", icon: Users },
  { to: "/citas", label: "Citas", icon: ClipboardPlus },
  { to: "/calendario", label: "Calendario", icon: CalendarDays },
  { to: "/historias", label: "Historias clinicas", icon: Stethoscope },
  { to: "/podologia", label: "Expedientes podologicos", icon: Footprints },
  { to: "/recetas", label: "Recetas", icon: NotebookPen },
  { to: "/ventas", label: "Caja y ventas", icon: WalletCards },
  { to: "/recordatorios", label: "Recordatorios", icon: FileClock },
  { to: "/administracion", label: "Administracion", icon: Settings },
  { to: "/auditoria", label: "Auditoria", icon: History }
];

function LayoutContent() {
  const [open, setOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState("");
  const { profile, signOut } = useAuth();
  const { branches, selectedBranchId, setSelectedBranchId, canSelectAll } = useBranch();
  const navigate = useNavigate();
  const location = useLocation();
  const dashboardQuery = useQuery({
    queryKey: ["dashboard", selectedBranchId],
    queryFn: () => getDashboardData(selectedBranchId)
  });

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  const visibleNav = navItems.filter((item) => {
    if (["/administracion", "/auditoria"].includes(item.to)) return profile?.rol === "administrador";
    if (["/historias", "/podologia", "/recetas"].includes(item.to)) return profile?.rol !== "recepcion";
    if (item.to === "/ventas") return profile?.rol !== "profesional";
    return true;
  });

  const initials = useMemo(() => {
    const names = [profile?.nombres, profile?.apellidos].filter(Boolean);
    return names.map((name) => name?.charAt(0).toUpperCase()).join("").slice(0, 2) || "BF";
  }, [profile?.apellidos, profile?.nombres]);

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = globalSearch.trim();
    if (!query) return;
    navigate(`/pacientes?buscar=${encodeURIComponent(query)}`);
    setGlobalSearch("");
  };

  const pendingNotifications = dashboardQuery.data?.pendingReminders.length ?? 0;

  return (
    <div className="app-shell">
      <aside className={`sidebar ${open ? "sidebar--open" : ""}`}>
        <div className="sidebar__brand">
          <img src="/favicon.png" alt="" aria-hidden="true" />
          <div>
            <strong>BODY FEET</strong>
            <span>Podologia y rehabilitacion</span>
          </div>
        </div>
        <nav className="nav" aria-label="Navegacion principal">
          {visibleNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) => `nav__link ${isActive ? "nav__link--active" : ""}`}
              onClick={() => setOpen(false)}
            >
              <item.icon />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar__footer">
          <img src="/favicon.png" alt="" aria-hidden="true" />
          <div>
            <strong>Body Feet</strong>
            <span>Cuidado profesional en cada paso.</span>
          </div>
        </div>
      </aside>
      {open ? <button className="sidebar-scrim" type="button" aria-label="Cerrar menu" onClick={() => setOpen(false)} /> : null}
      <main className="main">
        <header className="topbar">
          <div className="topbar__left">
            <Button className="mobile-menu" variant="ghost" type="button" aria-label="Abrir menu" aria-expanded={open} onClick={() => setOpen(true)}>
              <Menu />
            </Button>
            <form className="topbar-search" role="search" onSubmit={submitSearch}>
              <Search aria-hidden="true" />
              <input
                value={globalSearch}
                onChange={(event) => setGlobalSearch(event.target.value)}
                placeholder="Buscar pacientes por nombre, DNI o telefono"
                aria-label="Buscar pacientes"
              />
              <kbd>Enter</kbd>
            </form>
          </div>
          <div className="topbar__right">
            <label className="topbar-branch">
              <Building2 aria-hidden="true" />
              <span className="sr-only">Seleccionar sede</span>
              <Select
                value={selectedBranchId}
                onChange={(event) => setSelectedBranchId(event.target.value)}
                aria-label="Seleccionar sede"
              >
                {canSelectAll ? <option value="all">Todas las sedes</option> : null}
                {branches.map((branch) => (
                  <option value={branch.id} key={branch.id}>
                    {branch.nombre}
                  </option>
                ))}
              </Select>
            </label>
            <button
              className="notification-button"
              type="button"
              aria-label={`${pendingNotifications} recordatorios pendientes`}
              onClick={() => navigate("/recordatorios")}
            >
              <Bell />
              {pendingNotifications > 0 ? <span>{pendingNotifications > 9 ? "9+" : pendingNotifications}</span> : null}
            </button>
            <div className="user-avatar" aria-hidden="true">{initials}</div>
            <div className="topbar-user">
              <strong>{profile ? `${profile.nombres} ${profile.apellidos}` : "Usuario"}</strong>
              <span>{profile ? ROLE_LABELS[profile.rol] : ""}</span>
            </div>
            <Button
              type="button"
              variant="ghost"
              aria-label="Cerrar sesion"
              onClick={async () => {
                await signOut();
                navigate("/login");
              }}
            >
              <LogOut />
            </Button>
          </div>
        </header>
        <Suspense fallback={<main className="page"><TableSkeleton rows={8} /></main>}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}

export function AppLayout() {
  return (
    <BranchProvider>
      <LayoutContent />
    </BranchProvider>
  );
}

