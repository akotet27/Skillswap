import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { apiJson, setTokens, clearTokens } from "../api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadMe = useCallback(async () => {
    const hasToken = !!localStorage.getItem("skillswap-access-token");
    if (!hasToken) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const me = await apiJson("/api/auth/me");
      setUser(me);
    } catch {
      clearTokens();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  const applyTokens = useCallback(
    async (access, refresh) => {
      setTokens(access, refresh);
      await loadMe();
    },
    [loadMe]
  );

  const logout = useCallback(async () => {
    const refresh = localStorage.getItem("skillswap-refresh-token");
    clearTokens();
    setUser(null);
    if (refresh) {
      try {
        await apiJson("/api/auth/logout", { method: "POST", body: JSON.stringify({ refresh_token: refresh }) });
      } catch {
        // best-effort -- tokens are already cleared client-side
      }
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, applyTokens, logout, refreshUser: loadMe }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
