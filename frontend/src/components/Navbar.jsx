import { Link } from "react-router-dom";
import { Menu, X, Sun, Moon } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useSidebar } from "../context/SidebarContext";

/** The floating pill nav -- logo, hamburger toggle, theme switch, and the
 * primary CTA. The menu itself (all destinations, Settings, Logout) lives
 * in SidebarDrawer, a fixed left-hand panel that pushes page content over
 * rather than a dropdown that floats on top of it. */
export default function Navbar() {
  const { user } = useAuth();
  const { theme, toggle } = useTheme();
  const { open, toggle: toggleMenu } = useSidebar();

  return (
    <div className="nav-wrap">
      <nav className="nav-pill">
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
          <button
            type="button"
            className="nav-menu-btn"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={toggleMenu}
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>

          <Link
            to="/"
            style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", color: "var(--text-heading)", fontWeight: 600, fontSize: "var(--text-body-lg)", textDecoration: "none" }}
          >
            <img src="/logo-icon.png" alt="" width={26} height={26} style={{ borderRadius: 6, flexShrink: 0 }} />
            SkillSwap
          </Link>
        </div>

        <div className="nav-links">
          <button className="btn btn-sm btn-secondary" onClick={toggle} aria-label="Toggle dark mode">
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          {!user && <Link to="/signup" className="btn btn-sm btn-primary">Join SkillSwap</Link>}
        </div>
      </nav>
    </div>
  );
}
