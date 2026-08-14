import { Link } from "react-router-dom";
import { Menu, X, Sun, Moon } from "lucide-react";
import { useTheme } from "../context/ThemeContext";
import { useSidebar } from "../context/SidebarContext";

/** The floating pill nav for guest/marketing pages only -- an
 * authenticated user gets the persistent AppSidebar instead (see
 * App.jsx), so this never renders with a logged-in user and doesn't need
 * to branch on auth state. Logo, hamburger toggle (opens SidebarDrawer),
 * theme switch, and the "Join SkillSwap" CTA. */
export default function Navbar() {
  const { theme, toggle } = useTheme();
  const { open, toggle: toggleMenu } = useSidebar();

  return (
    <div className="nav-wrap">
      <nav className="nav-bar-inner">
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

          <Link to="/signup" className="btn btn-sm btn-primary">Join SkillSwap</Link>
        </div>
      </nav>
    </div>
  );
}
