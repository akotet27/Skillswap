import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

/**
 * The backend's /api/auth/google/callback redirects here with tokens in
 * the URL *fragment* (never a query string -- fragments never reach the
 * server or get logged). We parse it client-side and never send it
 * anywhere else.
 */
export default function OAuthCallbackPage() {
  const navigate = useNavigate();
  const { applyTokens } = useAuth();

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const access = params.get("access_token");
    const refresh = params.get("refresh_token");
    if (access && refresh) {
      applyTokens(access, refresh).then(() => navigate("/home", { replace: true }));
    } else {
      navigate("/login", { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div className="container" style={{ paddingTop: "var(--space-16)" }}>Signing you in…</div>;
}
