import { useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Home, Compass, Repeat, CalendarClock, MessageSquare, User, Settings, LogOut } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useSidebar } from "../context/SidebarContext";

const AUTHED_LINKS = [
  { label: "Browse", to: "/browse", icon: Compass },
  { label: "Requests", to: "/requests", icon: Repeat },
  { label: "Sessions", to: "/sessions", icon: CalendarClock },
  { label: "Messages", to: "/messages", icon: MessageSquare },
  { label: "Profile", to: "/profile", icon: User },
  { label: "Settings", to: "/settings", icon: Settings },
];

/** A fixed left-hand drawer, not a dropdown -- it doesn't float over the
 * page. Instead App.jsx shifts the rest of the page content over to the
 * right (see .app-shell.shifted in global.css) whenever this is open, so
 * opening the menu makes room for itself instead of covering anything. */
export default function SidebarDrawer() {
  const { user, logout } = useAuth();
  const { open, close } = useSidebar();
  const navigate = useNavigate();
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
        {/* Only shown once you've actually left the home page -- on "/"
            itself it would just be a no-op link back to where you are. */}
        {awayFromHome && (
          <Link to="/" className="nav-dropdown-item" onClick={close}>
            <Home size={17} />
            Home
          </Link>
        )}
        {user ? (
          <>
            {AUTHED_LINKS.map(({ label, to, icon: Icon }) => (
              <Link key={to} to={to} className="nav-dropdown-item" onClick={close}>
                <Icon size={17} />
                {label}
              </Link>
            ))}
            <button
              type="button"
              className="nav-dropdown-item"
              onClick={async () => {
                close();
                await logout();
                navigate("/login");
              }}
            >
              <LogOut size={17} />
              Log out
            </button>
          </>
        ) : (
          <>
            <a href="#how-it-works" className="nav-dropdown-item" onClick={close}>How It Works</a>
            <a href="#testimonials" className="nav-dropdown-item" onClick={close}>Testimonials</a>
            <Link to="/login" className="nav-dropdown-item" onClick={close}>Log in</Link>
          </>
        )}
      </nav>
    </aside>
  );
}
