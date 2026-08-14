import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthContext";
import { apiJson } from "../api/client";

const NotificationsContext = createContext(null);
const WS_BASE = import.meta.env.VITE_WS_BASE_URL || "ws://localhost:8000";

/** One persistent WebSocket per authenticated session (/ws/notifications,
 * a second room-namespace in the same shared ConnectionManager the chat
 * and video rooms use -- see chat_ws.py) -- lets a "new message" or "new
 * swap request" reach the sidebar's badges and a toast regardless of
 * which page you're on, not just when you happen to have the relevant
 * page open. ChatPage registers itself as "the active conversation" on
 * mount so messages belonging to it don't also pop a toast (they're
 * already visible in the open transcript); there's no equivalent for
 * requests since RequestsPage has nothing "live" to render into. */
export function NotificationsProvider({ children }) {
  const { user } = useAuth();
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [pendingRequestsTotal, setPendingRequestsTotal] = useState(0);
  const [toast, setToast] = useState(null);
  const activeConversationRef = useRef(null);

  function refreshUnreadTotal() {
    apiJson("/api/conversations/unread-count")
      .then((r) => setUnreadTotal(r.unread_total))
      .catch(() => {});
  }

  function refreshPendingRequestsTotal() {
    apiJson("/api/swap-requests/pending-count")
      .then((r) => setPendingRequestsTotal(r.pending_count))
      .catch(() => {});
  }

  useEffect(() => {
    if (!user) {
      setUnreadTotal(0);
      setPendingRequestsTotal(0);
      return;
    }
    refreshUnreadTotal();
    refreshPendingRequestsTotal();

    const token = localStorage.getItem("skillswap-access-token");
    const ws = new WebSocket(`${WS_BASE}/ws/notifications?token=${token}`);
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "new-message-notification") {
        setUnreadTotal(data.unread_total);
        if (data.conversation_id !== activeConversationRef.current) {
          setToast({
            id: `msg-${data.conversation_id}-${Date.now()}`,
            kind: "message",
            title: data.sender_name,
            preview: data.preview,
            navigateTo: `/messages/${data.conversation_id}`,
          });
        }
      } else if (data.type === "new-request-notification") {
        setPendingRequestsTotal(data.pending_count);
        setToast({
          id: `req-${data.request_id}-${Date.now()}`,
          kind: "request",
          title: data.sender_name,
          preview: data.preview,
          navigateTo: "/requests",
        });
      }
    };
    return () => ws.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const value = {
    unreadTotal,
    pendingRequestsTotal,
    toast,
    dismissToast: () => setToast(null),
    refreshUnreadTotal,
    refreshPendingRequestsTotal,
    setActiveConversation: (id) => {
      activeConversationRef.current = id;
    },
  };

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications must be used within a NotificationsProvider");
  return ctx;
}
