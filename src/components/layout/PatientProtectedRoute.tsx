import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { hasPatientPortalSession } from "../../services/patientPortal";
import { TableSkeleton } from "../ui/Skeleton";

export function PatientProtectedRoute() {
  const { session, profile, loading } = useAuth();

  if (loading) {
    return <main className="patient-portal patient-portal--loading"><TableSkeleton rows={6} /></main>;
  }

  if (session && profile) return <Navigate to="/" replace />;
  if (!hasPatientPortalSession()) return <Navigate to="/login" replace />;

  return <Outlet />;
}
