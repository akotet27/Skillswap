import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Mic, Paperclip, Search } from "lucide-react";
import { apiJson, API_BASE } from "../api/client";
import { usePresence } from "../hooks/usePresence";
import PresenceDot from "./PresenceDot";

function preview(msg, unreadCount) {
  if (!msg) return "No messages yet";
  if (msg.deleted_at) return "This message was deleted";
  if (msg.type === "voice") {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-1)" }}>
        <Mic size={14} /> Voice note
      </span>
    );
  }
  if (msg.type === "file") {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-1)" }}>
        <Paperclip size={14} /> {msg.file_name || "File"}
      </span>
    );
  }
  if (msg.iv) {
    // Encrypted previews can't be shown here -- the list only has what
    // the server sent, and the server never has the plaintext for those
    // (same reason the notification toast falls back to a generic line,
    // see backend/app/api/routes/chat_ws.py). The unread count is real
    // data we do have, though, so "3 new messages" carries more actual
    // information than a flat "New message" every time.
    if (unreadCount > 1) return `${unreadCount} new messages`;
    if (unreadCount === 1) return "1 new message";
    return "Message";
  }
  return msg.content;
}

/** The always-visible list half of the WhatsApp/Telegram-style split view
 * (see MessagesLayout.jsx) -- selecting a row navigates to
 * /messages/:id, which renders ChatPage in the other pane. `activeId`
 * highlights the currently-open conversation; refetches are driven by
 * the parent remounting this on conversation-list-affecting events
 * (there's no live "conversation list changed" push yet, same as before
 * this was split out of ConversationsPage). */
export default function ConversationList({ activeId }) {
  const [conversations, setConversations] = useState(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    apiJson("/api/conversations").then(setConversations).catch((e) => setError(e.message));
  }, []);

  // ChatPage marks a conversation read on the backend the moment it opens
  // (see its own effect keyed on conversationId), but this list is only
  // ever fetched once above and MessagesLayout never unmounts it between
  // conversations -- without this, the badge here would keep showing the
  // stale unread_count from before you opened it until a full page
  // reload. Mirroring that same "opening it reads it" fact locally here
  // avoids a network round trip just to zero out a number we already know.
  useEffect(() => {
    if (!activeId) return;
    setConversations((prev) =>
      prev?.map((c) => (String(c.id) === String(activeId) ? { ...c, unread_count: 0 } : c)) ?? prev
    );
  }, [activeId]);

  const presence = usePresence(conversations?.map((c) => c.other_user.id));

  const visible = useMemo(() => {
    if (!conversations) return conversations;
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => c.other_user.name.toLowerCase().includes(q));
  }, [conversations, query]);

  return (
    <div>
      {conversations !== null && conversations.length > 0 && (
        <div style={{ padding: "0 var(--space-4) var(--space-3)" }}>
          <div style={{ position: "relative" }}>
            <Search size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-tertiary)", pointerEvents: "none" }} />
            <input
              className="input"
              placeholder="Search conversations…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ paddingLeft: 34, width: "100%" }}
              aria-label="Search conversations"
            />
          </div>
        </div>
      )}

      {error && <div className="error-banner" style={{ margin: "var(--space-4)" }}>{error}</div>}
      {conversations === null && !error && <p style={{ padding: "var(--space-4)" }}>Loading…</p>}
      {conversations?.length === 0 && (
        <p style={{ padding: "var(--space-4)" }}>
          No conversations yet — start one from a <Link to="/browse">match</Link>.
        </p>
      )}
      {conversations?.length > 0 && visible.length === 0 && (
        <p className="field-hint" style={{ padding: "0 var(--space-4)" }}>No conversations match "{query}".</p>
      )}

      <div style={{ display: "flex", flexDirection: "column" }}>
        {visible?.map((c) => {
          const unread = c.unread_count > 0;
          return (
            <Link
              key={c.id}
              to={`/messages/${c.id}`}
              className={`conversation-row${String(c.id) === String(activeId) ? " active" : ""}`}
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
                <strong style={{ color: unread ? "var(--text-heading)" : "inherit" }}>{c.other_user.name}</strong>
                <p
                  style={{
                    margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    color: unread ? "var(--text-heading)" : "var(--text-secondary)",
                    fontWeight: unread ? 700 : 400,
                  }}
                >
                  {preview(c.last_message, c.unread_count)}
                </p>
              </div>
              {unread && <span className="unread-badge">{c.unread_count > 99 ? "99+" : c.unread_count}</span>}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
