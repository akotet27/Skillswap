import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Mic } from "lucide-react";
import { apiJson, API_BASE } from "../api/client";
import { usePresence } from "../hooks/usePresence";
import PresenceDot from "../components/PresenceDot";

function preview(msg) {
  if (!msg) return "No messages yet";
  if (msg.type === "voice") {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-1)" }}>
        <Mic size={14} /> Voice note
      </span>
    );
  }
  return msg.content;
}

export default function ConversationsPage() {
  const [conversations, setConversations] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiJson("/api/conversations").then(setConversations).catch((e) => setError(e.message));
  }, []);

  const presence = usePresence(conversations?.map((c) => c.other_user.id));

  return (
    <div className="container" style={{ paddingTop: "var(--space-10)", paddingBottom: "var(--space-20)" }}>
      <p className="eyebrow">Messages</p>
      <h1>Conversations</h1>

      {error && <div className="error-banner">{error}</div>}
      {conversations === null && !error && <p>Loading…</p>}
      {conversations?.length === 0 && (
        <p>
          No conversations yet — start one from a <Link to="/browse">match</Link>.
        </p>
      )}

      <div style={{ display: "grid", gap: "var(--space-3)" }}>
        {conversations?.map((c) => (
          <Link
            key={c.id}
            to={`/messages/${c.id}`}
            className="card"
            style={{ padding: "var(--space-5) var(--space-6)", display: "flex", alignItems: "center", gap: "var(--space-4)", color: "inherit" }}
          >
            <div style={{ position: "relative", flexShrink: 0 }}>
              <img
                src={c.other_user.photo_url ? `${API_BASE}${c.other_user.photo_url}` : `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(c.other_user.name)}`}
                alt=""
                width={44}
                height={44}
                style={{ borderRadius: "999px", objectFit: "cover", border: "1px solid var(--border)" }}
              />
              <PresenceDot online={!!presence[c.other_user.id]} style={{ position: "absolute", bottom: 0, right: 0 }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong>{c.other_user.name}</strong>
              <p style={{ margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{preview(c.last_message)}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
