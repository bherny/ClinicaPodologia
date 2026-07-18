import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { TableSkeleton } from "../ui/Skeleton";

export function ProtectedRoute() {
  const { session, loading, profileError } = useAuth();

  if (loading) {
    return (
      <main className="page">
        <TableSkeleton rows={8} />
      </main>
    );
  }

  if (!session) return <Navigate to="/login" replace />;

  if (profileError) {
    return (
      <main className="page">
        <div className="alert">{profileError}</div>
      </main>
    );
  }

  return <Outlet />;
}
