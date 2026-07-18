import { lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/layout/AppLayout";
import { ProtectedRoute } from "./components/layout/ProtectedRoute";
import { LoginPage } from "./pages/LoginPage";

const DashboardPage = lazy(() => import("./pages/DashboardPage").then((module) => ({ default: module.DashboardPage })));
const PatientsPage = lazy(() => import("./pages/PatientsPage").then((module) => ({ default: module.PatientsPage })));
const AppointmentsPage = lazy(() => import("./pages/AppointmentsPage").then((module) => ({ default: module.AppointmentsPage })));
const CalendarPage = lazy(() => import("./pages/CalendarPage").then((module) => ({ default: module.CalendarPage })));
const RemindersPage = lazy(() => import("./pages/RemindersPage").then((module) => ({ default: module.RemindersPage })));
const ClinicalHistoryPage = lazy(() => import("./pages/ClinicalHistoryPage").then((module) => ({ default: module.ClinicalHistoryPage })));
const AdminPage = lazy(() => import("./pages/AdminPage").then((module) => ({ default: module.AdminPage })));
const AuditPage = lazy(() => import("./pages/AuditPage").then((module) => ({ default: module.AuditPage })));
const PrescriptionsPage = lazy(() => import("./pages/PrescriptionsPage").then((module) => ({ default: module.PrescriptionsPage })));
const PodologyPage = lazy(() => import("./pages/PodologyPage").then((module) => ({ default: module.PodologyPage })));
const SalesPage = lazy(() => import("./pages/SalesPage").then((module) => ({ default: module.SalesPage })));

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="pacientes" element={<PatientsPage />} />
          <Route path="citas" element={<AppointmentsPage />} />
          <Route path="calendario" element={<CalendarPage />} />
          <Route path="historias" element={<ClinicalHistoryPage />} />
          <Route path="recetas" element={<PrescriptionsPage />} />
          <Route path="podologia" element={<PodologyPage />} />
          <Route path="ventas" element={<SalesPage />} />
          <Route path="recordatorios" element={<RemindersPage />} />
          <Route path="administracion" element={<AdminPage />} />
          <Route path="auditoria" element={<AuditPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
