import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute({ children, adminOnly = false }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="container" style={{ paddingTop: "var(--space-16)" }}>Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  // Admin pages 403 server-side regardless -- this just avoids flashing the
  // page content at a non-admin before the API call comes back.
  if (adminOnly && !user.is_admin) return <Navigate to="/home" replace />;
  return children;
}
