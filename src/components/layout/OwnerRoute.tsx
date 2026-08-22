import { Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

export function OwnerRoute({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  if (profile?.rol !== "owner") return <Navigate to="/" replace />;
  return children;
}
