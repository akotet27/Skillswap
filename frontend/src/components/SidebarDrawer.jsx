import { useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { Home } from "lucide-react";
import { useSidebar } from "../context/SidebarContext";

/** Guest-only hamburger drawer for the marketing pages (/, /signup,
 * /login, etc.) -- an authenticated user gets the persistent AppSidebar
 * instead (see App.jsx), never this. A fixed left-hand drawer, not a
 * dropdown -- it doesn't float over the page. Instead App.jsx shifts the
 * rest of the page content over to the right (see .app-shell.shifted in
 * global.css) whenever this is open, so opening the menu makes room for
 * itself instead of covering anything. */
export default function SidebarDrawer() {
  const { open, close } = useSidebar();
  const { pathname } = useLocation();
  const awayFromHome = pathname !== "/";
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) close();
    }
    function onEscape(e) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open, close]);

  return (
    <aside ref={panelRef} className={`app-drawer${open ? " open" : ""}`} aria-hidden={!open}>
      {/* No close button here -- the hamburger button in the pill nav is
          the single toggle (it swaps to an X icon while open), so there's
          only ever one X on screen instead of two doing the same thing. */}
      <div style={{ display: "flex", alignItems: "center", marginBottom: "var(--space-8)" }}>
        <Link
          to="/"
          onClick={close}
          style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", color: "var(--text-heading)", fontWeight: 600, fontSize: "var(--text-body-lg)", textDecoration: "none" }}
        >
          <img src="/logo-icon.png" alt="" width={26} height={26} style={{ borderRadius: 6, flexShrink: 0 }} />
          SkillSwap
        </Link>
      </div>

      <nav role="menu" style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
        {awayFromHome && (
          <Link to="/" className="nav-dropdown-item" onClick={close}>
            <Home size={17} />
            Home
          </Link>
        )}
        <a href="#how-it-works" className="nav-dropdown-item" onClick={close}>How It Works</a>
        <a href="#testimonials" className="nav-dropdown-item" onClick={close}>Testimonials</a>
        <Link to="/login" className="nav-dropdown-item" onClick={close}>Log in</Link>
      </nav>
    </aside>
  );
}
