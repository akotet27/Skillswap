import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Home, Compass, CalendarClock, Handshake, MessageSquare, ShieldCheck, LogOut, Sun, Moon } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useNotifications } from "../context/NotificationsContext";
import { apiJson, API_BASE } from "../api/client";
import { formatCredits } from "../utils/credits";

/** Persistent authenticated nav shell -- present on every logged-in page,
 * always visible (sticky/fixed), not a hamburger-toggle drawer (that
 * pattern is now guest-only, see SidebarDrawer.jsx on the marketing
 * pages). Collapses to a bottom tab bar below 860px via pure CSS media
 * queries (.app-sidebar / .app-bottom-tabs), not a JS breakpoint --
 * both markups render always, only one is ever visible at a given width. */

const NAV_ITEMS = [
  { label: "Home", to: "/home", icon: Home },
  { label: "Browse", to: "/browse", icon: Compass },
  { label: "Requests", to: "/requests", icon: Handshake },
  { label: "Sessions", to: "/sessions", icon: CalendarClock },
  { label: "Messages", to: "/messages", icon: MessageSquare },
];

export default function AppSidebar() {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [credits, setCredits] = useState(null);
  const { unreadTotal, pendingRequestsTotal } = useNotifications();
  const navItems = user.is_admin ? [...NAV_ITEMS, { label: "Admin", to: "/admin", icon: ShieldCheck }] : NAV_ITEMS;
  const badgeCounts = { Messages: unreadTotal, Requests: pendingRequestsTotal };

  useEffect(() => {
    apiJson("/api/credits/me").then((c) => setCredits(c.balance)).catch(() => {});
  }, []);

  async function onLogout() {
    await logout();
    navigate("/login");
  }

  const avatarUrl = user.photo_url
    ? `${API_BASE}${user.photo_url}`
    : `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user.name)}`;

  return (
    <>
      {/* Wide viewports: a real sticky sidebar */}
      <aside className="app-sidebar">
        <Link to="/home" className="app-sidebar-logo">
          <img src="/logo-icon.png" alt="" width={28} height={28} style={{ borderRadius: 6, flexShrink: 0 }} />
          <span>SkillSwap</span>
        </Link>

        <nav style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)", flex: 1 }}>
          {navItems.map(({ label, to, icon: Icon }) => {
            const count = badgeCounts[label] || 0;
            return (
              <Link key={to} to={to} className={`app-sidebar-link${pathname === to ? " active" : ""}`} style={{ justifyContent: "space-between" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
                  <Icon size={18} />
                  {label}
                </span>
                {count > 0 && <span className="unread-badge">{count > 99 ? "99+" : count}</span>}
              </Link>
            );
          })}
        </nav>

        <button type="button" className="app-sidebar-link" onClick={toggle} style={{ border: "none", background: "none", cursor: "pointer", width: "100%", font: "inherit" }}>
          {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          {theme === "dark" ? "Light mode" : "Dark mode"}
        </button>

        <div className="app-sidebar-profile">
          <Link to="/profile" className="app-sidebar-profile-link">
            <img src={avatarUrl} alt="" width={36} height={36} style={{ borderRadius: "999px", objectFit: "cover", border: "1px solid var(--border)" }} />
            <div style={{ minWidth: 0 }}>
              <strong style={{ display: "block", fontSize: "var(--text-body-sm)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.name}</strong>
              <span className="field-hint">{credits === null ? "…" : `${formatCredits(credits)} credit${credits === 1 ? "" : "s"}`}</span>
            </div>
          </Link>
          <button type="button" onClick={onLogout} aria-label="Log out" className="app-sidebar-logout">
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {/* Narrow viewports: bottom tab bar, same destinations */}
      <nav className="app-bottom-tabs" aria-label="Primary">
        {NAV_ITEMS.map(({ label, to, icon: Icon }) => {
          const count = badgeCounts[label] || 0;
          return (
            <Link key={to} to={to} className={`app-bottom-tab${pathname === to ? " active" : ""}`} aria-label={label} style={{ position: "relative" }}>
              <Icon size={20} />
              <span>{label}</span>
              {count > 0 && (
                <span className="unread-badge" style={{ position: "absolute", top: 0, right: "22%" }}>
                  {count > 99 ? "99+" : count}
                </span>
              )}
            </Link>
          );
        })}
        <Link to="/profile" className={`app-bottom-tab${pathname === "/profile" ? " active" : ""}`} aria-label="Profile">
          <img src={avatarUrl} alt="" width={20} height={20} style={{ borderRadius: "999px", objectFit: "cover" }} />
          <span>Profile</span>
        </Link>
      </nav>
    </>
  );
}
