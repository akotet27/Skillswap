import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { X, MessageSquare } from "lucide-react";
import { useNotifications } from "../context/NotificationsContext";

const AUTO_DISMISS_MS = 6000;

/** Brief popup for an incoming message when you're not already looking
 * at that conversation -- sender, short preview, Open action, dismiss,
 * auto-dismisses if ignored. Rendered once at the app root (see
 * App.jsx) so it can appear over any authenticated page. */
export default function MessageToast() {
  const { toast, dismissToast } = useNotifications();
  const navigate = useNavigate();

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(dismissToast, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [toast, dismissToast]);

  if (!toast) return null;

  return (
    <div className="message-toast" role="status">
      <MessageSquare size={18} style={{ color: "var(--color-electric-blue)", flexShrink: 0, marginTop: 2 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <strong style={{ display: "block", fontSize: "var(--text-body-sm)" }}>{toast.senderName}</strong>
        <p style={{ margin: "2px 0 0", fontSize: "var(--text-body-sm)", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {toast.preview}
        </p>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          style={{ marginTop: "var(--space-3)" }}
          onClick={() => {
            dismissToast();
            navigate(`/messages/${toast.conversationId}`);
          }}
        >
          Open
        </button>
      </div>
      <button type="button" onClick={dismissToast} aria-label="Dismiss" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)", padding: 0 }}>
        <X size={16} />
      </button>
    </div>
  );
}
