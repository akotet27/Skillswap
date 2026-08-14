import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Mic, Square, Send, Video } from "lucide-react";
import { apiFetch, apiJson, API_BASE } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useNotifications } from "../context/NotificationsContext";
import PresenceDot from "../components/PresenceDot";

const WS_BASE = import.meta.env.VITE_WS_BASE_URL || "ws://localhost:8000";
const TYPING_SEND_THROTTLE_MS = 2000;
const TYPING_INDICATOR_TIMEOUT_MS = 3000;

function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export default function ChatPage() {
  const { conversationId } = useParams();
  const { user: me } = useAuth();
  const { setActiveConversation, refreshUnreadTotal } = useNotifications();
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [upcomingSession, setUpcomingSession] = useState(null);
  const [recording, setRecording] = useState(false);
  const [otherOnline, setOtherOnline] = useState(false);
  const [otherTyping, setOtherTyping] = useState(false);

  const wsRef = useRef(null);
  const scrollRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const lastTypingSentRef = useRef(0);
  const typingClearTimeoutRef = useRef(null);

  // Load conversation header + history + any joinable session before
  // opening the socket -- the REST calls also refresh the access token if
  // it's stale (see api/client.js), so the WS query-param token below is
  // guaranteed fresh at connect time.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [conv, history, session] = await Promise.all([
          apiJson(`/api/conversations/${conversationId}`),
          apiJson(`/api/conversations/${conversationId}/messages`),
          apiJson(`/api/conversations/${conversationId}/session`),
        ]);
        if (cancelled) return;
        setConversation(conv);
        setMessages(history);
        setUpcomingSession(session);
      } catch (e) {
        if (!cancelled) setError(e.message);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  // Opening a conversation marks it read (so the sidebar badge/unread
  // dots drop immediately, not just after a full page reload) and
  // registers it as "currently open" so NotificationsProvider knows not
  // to also pop a toast for messages that land in it while it's open --
  // they're already visible in the live transcript via the WS below.
  useEffect(() => {
    setActiveConversation(Number(conversationId));
    apiJson(`/api/conversations/${conversationId}/read`, { method: "POST" })
      .catch(() => {})
      .finally(refreshUnreadTotal);
    return () => setActiveConversation(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  // Open the WebSocket once we have a confirmed-fresh token.
  useEffect(() => {
    if (!conversation) return;
    const token = localStorage.getItem("skillswap-access-token");
    const ws = new WebSocket(`${WS_BASE}/ws/conversations/${conversationId}?token=${token}`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "chat") {
        setMessages((prev) => [...prev, data.message]);
      } else if (data.type === "presence" && data.user_id === conversation.other_user.id) {
        setOtherOnline(data.status === "online");
      } else if (data.type === "typing" && data.user_id === conversation.other_user.id) {
        setOtherTyping(true);
        clearTimeout(typingClearTimeoutRef.current);
        typingClearTimeoutRef.current = setTimeout(() => setOtherTyping(false), TYPING_INDICATOR_TIMEOUT_MS);
      }
    };
    ws.onerror = () => setError("Connection lost — refresh to reconnect.");

    return () => {
      ws.close();
      clearTimeout(typingClearTimeoutRef.current);
    };
  }, [conversation, conversationId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  function sendText(e) {
    e.preventDefault();
    if (!draft.trim() || wsRef.current?.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: "chat", content: draft.trim() }));
    setDraft("");
  }

  function onDraftChange(value) {
    setDraft(value);
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;
    // At most one "typing" event every TYPING_SEND_THROTTLE_MS while
    // actively typing, not one per keystroke -- the receiving end only
    // needs "still going" pings, not a blow-by-blow.
    const now = Date.now();
    if (now - lastTypingSentRef.current >= TYPING_SEND_THROTTLE_MS) {
      lastTypingSentRef.current = now;
      wsRef.current.send(JSON.stringify({ type: "typing" }));
    }
  }

  async function toggleRecording() {
    if (recording) {
      mediaRecorderRef.current?.stop();
      setRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const fd = new FormData();
        fd.append("file", blob, "voice-note.webm");
        try {
          const res = await apiFetch(`/api/conversations/${conversationId}/messages/voice`, { method: "POST", body: fd });
          if (res.ok) {
            const message = await res.json();
            setMessages((prev) => [...prev, message]);
          }
        } catch {
          setError("Failed to upload voice note.");
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      setError("Microphone access was denied.");
    }
  }

  if (error && !conversation) {
    return <div className="container" style={{ paddingTop: "var(--space-16)" }}><div className="error-banner">{error}</div></div>;
  }
  if (!conversation) return <div className="container" style={{ paddingTop: "var(--space-16)" }}>Loading…</div>;

  const joinLeadMs = (upcomingSession?.join_active_lead_minutes ?? 5) * 60 * 1000;
  const joinActive = upcomingSession && new Date(upcomingSession.scheduled_start_utc).getTime() - joinLeadMs <= Date.now();

  return (
    <div className="container" style={{ maxWidth: 720, paddingTop: "var(--space-8)", paddingBottom: "var(--space-8)", display: "flex", flexDirection: "column", height: "calc(100vh - 90px)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-4)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
          <div style={{ position: "relative", flexShrink: 0 }}>
            <img
              src={conversation.other_user.photo_url ? `${API_BASE}${conversation.other_user.photo_url}` : `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(conversation.other_user.name)}`}
              alt=""
              width={40}
              height={40}
              style={{ borderRadius: "999px", objectFit: "cover", border: "1px solid var(--border)" }}
            />
            <PresenceDot online={otherOnline} style={{ position: "absolute", bottom: 0, right: 0 }} />
          </div>
          <div>
            <h3 style={{ margin: 0 }}>{conversation.other_user.name}</h3>
            <p className="field-hint" style={{ margin: 0, minHeight: "1.2em" }}>
              {otherTyping ? "typing…" : otherOnline ? "Online" : "Offline"}
            </p>
          </div>
        </div>
        {upcomingSession && (
          <Link
            to={joinActive ? `/session/${upcomingSession.id}` : "#"}
            className={`btn btn-sm ${joinActive ? "btn-primary" : "btn-secondary"}`}
            aria-disabled={!joinActive}
            onClick={(e) => !joinActive && e.preventDefault()}
            title={joinActive ? "Join now" : `Opens ${upcomingSession.join_active_lead_minutes} min before start`}
          >
            <Video size={16} />
            {joinActive ? "Join session" : "Session scheduled"}
          </Link>
        )}
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div ref={scrollRef} className="card" style={{ flex: 1, overflowY: "auto", padding: "var(--space-5)", display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        {messages.map((m) => {
          if (m.type === "system") {
            // Centered, muted pill -- never a left/right-aligned bubble
            // like a normal sender message, same convention as Slack's
            // "X joined the channel" rows (see signaling_ws.py's
            // _post_system_message, the source of these).
            return (
              <div key={m.id} style={{ alignSelf: "center" }}>
                <span className="tag tag-neutral" style={{ fontWeight: 500 }}>{m.content}</span>
              </div>
            );
          }
          const mine = m.sender_id === me.id;
          return (
            <div key={m.id} style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "75%" }}>
              <div className={`chat-bubble ${mine ? "chat-bubble-mine" : "chat-bubble-theirs"}`}>
                {m.type === "voice" ? (
                  <audio controls src={`${API_BASE}${m.content_url}`} style={{ maxWidth: "220px" }} />
                ) : (
                  <span>{m.content}</span>
                )}
              </div>
              <p className="field-hint" style={{ margin: "var(--space-1) var(--space-2) 0", textAlign: mine ? "right" : "left" }}>
                {fmtTime(m.created_at)}
              </p>
            </div>
          );
        })}
      </div>

      <form onSubmit={sendText} style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-4)" }}>
        <button
          type="button"
          className={`btn btn-sm ${recording ? "btn-primary" : "btn-secondary"}`}
          onClick={toggleRecording}
          aria-label={recording ? "Stop recording" : "Record a voice note"}
        >
          {recording ? <Square size={16} /> : <Mic size={16} />}
        </button>
        <input
          className="input"
          placeholder="Type a message…"
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          style={{ flex: 1 }}
        />
        <button className="btn btn-primary btn-sm">
          <Send size={16} />
          Send
        </button>
      </form>
    </div>
  );
}
