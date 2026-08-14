import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthContext";
import { apiJson } from "../api/client";

const NotificationsContext = createContext(null);
const WS_BASE = import.meta.env.VITE_WS_BASE_URL || "ws://localhost:8000";

/** One persistent WebSocket per authenticated session (/ws/notifications,
 * a second room-namespace in the same shared ConnectionManager the chat
 * and video rooms use -- see chat_ws.py) -- lets a "new message" reach
 * the sidebar's unread badge and a toast regardless of which page you're
 * on, not just when you happen to have that exact conversation open.
 * ChatPage registers itself as "the active conversation" on mount so
 * messages belonging to it don't also pop a toast (they're already
 * visible in the open transcript). */
export function NotificationsProvider({ children }) {
  const { user } = useAuth();
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [toast, setToast] = useState(null);
  const activeConversationRef = useRef(null);

  function refreshUnreadTotal() {
    apiJson("/api/conversations/unread-count")
      .then((r) => setUnreadTotal(r.unread_total))
      .catch(() => {});
  }

  useEffect(() => {
    if (!user) {
      setUnreadTotal(0);
      return;
    }
    refreshUnreadTotal();

    const token = localStorage.getItem("skillswap-access-token");
    const ws = new WebSocket(`${WS_BASE}/ws/notifications?token=${token}`);
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type !== "new-message-notification") return;
      setUnreadTotal(data.unread_total);
      if (data.conversation_id !== activeConversationRef.current) {
        setToast({
          id: `${data.conversation_id}-${Date.now()}`,
          conversationId: data.conversation_id,
          senderName: data.sender_name,
          preview: data.preview,
        });
      }
    };
    return () => ws.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const value = {
    unreadTotal,
    toast,
    dismissToast: () => setToast(null),
    refreshUnreadTotal,
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
