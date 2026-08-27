const routeLoaders: Record<string, () => Promise<unknown>> = {
  "/": () => import("../pages/DashboardPage"),
  "/pacientes": () => import("../pages/PatientsPage"),
  "/citas": () => import("../pages/AppointmentsPage"),
  "/calendario": () => import("../pages/CalendarPage"),
  "/historias": () => import("../pages/ClinicalHistoryPage"),
  "/podologia": () => import("../pages/PodologyPage"),
  "/recetas": () => import("../pages/PrescriptionsPage"),
  "/ventas": () => import("../pages/SalesPage"),
  "/reportes": () => import("../pages/ReportsPage"),
  "/comunidad": () => import("../pages/CommunityPage"),
  "/owner": () => import("../pages/OwnerPage"),
  "/recordatorios": () => import("../pages/RemindersPage"),
  "/administracion": () => import("../pages/AdminPage"),
  "/auditoria": () => import("../pages/AuditPage")
};

const requestedRoutes = new Set<string>();

function allowsPrefetch() {
  if (typeof navigator === "undefined") return false;
  const connection = (navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
  }).connection;
  return !connection?.saveData && !connection?.effectiveType?.includes("2g");
}

export function prefetchRoute(path: string) {
  const loader = routeLoaders[path];
  if (!loader || requestedRoutes.has(path) || !allowsPrefetch()) return;
  requestedRoutes.add(path);
  void loader().catch(() => requestedRoutes.delete(path));
}
