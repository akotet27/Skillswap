import { createContext, useCallback, useContext, useState } from "react";

const SidebarContext = createContext(null);

/** Holds just the open/closed state of the left nav drawer -- lifted out
 * of Navbar so both the drawer itself (fixed, rendered at the App root)
 * and the page content wrapper (which shifts over to make room for it)
 * can share the same state without threading props through App.jsx. */
export function SidebarProvider({ children }) {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((o) => !o), []);
  const close = useCallback(() => setOpen(false), []);

  return <SidebarContext.Provider value={{ open, toggle, close }}>{children}</SidebarContext.Provider>;
}

export function useSidebar() {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebar must be used within a SidebarProvider");
  return ctx;
}
