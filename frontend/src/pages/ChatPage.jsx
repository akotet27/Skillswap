import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Mic, Square, Send, Video, ArrowLeft, Pencil, Trash2, Paperclip, FileText, Download, Check, X as XIcon } from "lucide-react";
import { apiFetch, apiJson, API_BASE } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useNotifications } from "../context/NotificationsContext";
import PresenceDot from "../components/PresenceDot";
import { getOrCreateKeyPair, exportPublicKeyBase64, deriveSharedKey, encryptText, decryptText } from "../crypto/e2e";

const WS_BASE = import.meta.env.VITE_WS_BASE_URL || "ws://localhost:8000";
const TYPING_SEND_THROTTLE_MS = 2000;
const TYPING_INDICATOR_TIMEOUT_MS = 3000;

function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function fmtFileSize(bytes) {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ChatPage() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const { user: me, refreshUser } = useAuth();
  const { setActiveConversation, refreshUnreadTotal } = useNotifications();
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [upcomingSession, setUpcomingSession] = useState(null);
  const [recording, setRecording] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [pendingFile, setPendingFile] = useState(null); // File | null -- staged, not yet uploaded
  const [pendingFilePreviewUrl, setPendingFilePreviewUrl] = useState(null); // image thumbnail, if applicable
  const [otherOnline, setOtherOnline] = useState(false);
  const [otherTyping, setOtherTyping] = useState(false);
  const [decrypted, setDecrypted] = useState({}); // message id -> plaintext | null (undecryptable)
  const [sharedKeyReady, setSharedKeyReady] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState("");

  const wsRef = useRef(null);
  const scrollRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const fileInputRef = useRef(null);
  const lastTypingSentRef = useRef(0);
  const typingClearTimeoutRef = useRef(null);
  const keyPairRef = useRef(null); // this browser's persisted ECDH keypair (see crypto/e2e.js)
  const sharedKeyRef = useRef(null); // this conversation's derived AES-GCM key, once both sides have a public key

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

  // E2E encrypted chat, step 1: make sure this browser has a keypair (see
  // crypto/e2e.js -- generated once, persisted in IndexedDB from then on),
  // and the server has a current copy of its public half. Runs once per
  // mount; idempotent, so remounting (e.g. a page refresh mid-conversation)
  // just loads the same persisted keypair rather than generating a new one
  // -- that's what makes historical encrypted messages still decrypt after
  // a refresh.
  useEffect(() => {
    let cancelled = false;
    async function setupKeys() {
      const keyPair = await getOrCreateKeyPair();
      if (cancelled) return;
      keyPairRef.current = keyPair;
      const myPublicKeyB64 = await exportPublicKeyBase64(keyPair.publicKey);
      if (cancelled) return;
      if (me.public_key !== myPublicKeyB64) {
        try {
          await apiJson("/api/users/me", { method: "PATCH", body: JSON.stringify({ public_key: myPublicKeyB64 }) });
          if (!cancelled) await refreshUser();
        } catch {
          // Best-effort -- chat still works unencrypted (see the
          // fallback in sendText) if this upload fails.
        }
      }
    }
    setupKeys();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Step 2: once this browser's keypair is ready AND we know the other
  // participant's public key (part of the conversation payload), derive
  // the shared AES-GCM key. `sharedKeyReady` (state, not just the ref) is
  // what lets the decrypt effect below know it's safe to actually run --
  // a ref change alone wouldn't trigger a re-render/effect pass.
  //
  // This *retries*, not just tries once: the other person's public key
  // might not exist yet the moment this page loads (they haven't opened
  // chat since E2E shipped, or their key just changed -- e.g. they
  // cleared browser storage and got a fresh keypair). A one-shot attempt
  // would get permanently stuck showing "Decrypting…" for every message
  // from them even after their real key becomes available server-side,
  // because nothing here would ever look again. Polling re-fetches the
  // conversation (and thus their current public key) until it works.
  useEffect(() => {
    if (!conversation) return;
    let cancelled = false;
    let timer = null;

    async function tryDerive(theirPublicKey) {
      if (!theirPublicKey || !keyPairRef.current) return false;
      try {
        const key = await deriveSharedKey(keyPairRef.current.privateKey, theirPublicKey);
        if (cancelled) return true;
        sharedKeyRef.current = key;
        setSharedKeyReady(true);
        return true;
      } catch {
        return false; // malformed/incompatible key -- treat like missing, keep retrying
      }
    }

    async function poll(attempt) {
      if (cancelled || attempt > 40) return; // ~ a few minutes of retrying, then give up quietly
      let theirPublicKey = conversation.other_user?.public_key;
      // First attempt uses the conversation payload already in hand;
      // every retry re-fetches it fresh, since the whole point is that
      // it may have changed since we loaded.
      if (attempt > 0) {
        try {
          const fresh = await apiJson(`/api/conversations/${conversationId}`);
          theirPublicKey = fresh.other_user?.public_key;
        } catch {
          // network hiccup -- just retry again on the next tick
        }
      }
      if (await tryDerive(theirPublicKey)) return;
      timer = setTimeout(() => poll(attempt + 1), 4000);
    }

    poll(0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [conversation, conversationId]);

  // Step 3: decrypt any text messages that have an `iv` (i.e. were sent
  // encrypted) and aren't in the decrypted cache yet -- covers the
  // initial history load, new messages arriving live, and edits (an
  // edited message gets a fresh iv, so it needs decrypting again too).
  useEffect(() => {
    if (!sharedKeyReady) return;
    let cancelled = false;
    async function run() {
      const pending = messages.filter((m) => m.type === "text" && m.iv && !m.deleted_at && !(m.id in decrypted));
      if (pending.length === 0) return;
      const updates = {};
      for (const m of pending) {
        try {
          updates[m.id] = await decryptText(sharedKeyRef.current, m.content, m.iv);
        } catch {
          updates[m.id] = null; // couldn't decrypt (e.g. different device, no matching private key)
        }
      }
      if (!cancelled) setDecrypted((prev) => ({ ...prev, ...updates }));
    }
    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, sharedKeyReady]);

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
      } else if (data.type === "message-edited" || data.type === "message-deleted") {
        // Both replace the one message in place by id -- an edit carries
        // fresh content/iv (so it needs re-decrypting, hence dropping it
        // from the cache too), a delete carries the already-redacted row
        // (content/iv nulled server-side, see conversations.py).
        setMessages((prev) => prev.map((m) => (m.id === data.message.id ? data.message : m)));
        setDecrypted((prev) => {
          if (!(data.message.id in prev)) return prev;
          const next = { ...prev };
          delete next[data.message.id];
          return next;
        });
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

  // Esc closes the chat (same destination as the back arrow) -- unless a
  // message edit is in progress, in which case the edit input's own Esc
  // handler (see the input below) cancels the edit instead. That input's
  // keydown fires and is handled before this document-level listener
  // sees it, but this still needs the `editingId` guard so a *second*
  // Esc press right after doesn't immediately close the whole chat too.
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key !== "Escape" || editingId !== null) return;
      navigate("/messages");
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [editingId, navigate]);

  // Encrypt whenever we have a shared key for this conversation; fall
  // back to plaintext (iv omitted) if we don't -- e.g. the other person
  // hasn't opened chat since this feature shipped, so they have no
  // public key on file yet. Backward compatible either way. Shared by
  // both sending a new message and saving an edit.
  async function encryptOrPlain(text) {
    if (sharedKeyRef.current) return encryptText(sharedKeyRef.current, text);
    return { content: text, iv: undefined };
  }

  async function sendText(e) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || wsRef.current?.readyState !== WebSocket.OPEN) return;
    setDraft("");
    const { content, iv } = await encryptOrPlain(text);
    wsRef.current.send(JSON.stringify({ type: "chat", content, iv }));
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

  function startEdit(m) {
    setError("");
    setEditingId(m.id);
    setEditDraft(m.type === "text" && m.iv ? decrypted[m.id] || "" : m.content || "");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditDraft("");
  }

  async function saveEdit(id) {
    const text = editDraft.trim();
    if (!text) return;
    try {
      const { content, iv } = await encryptOrPlain(text);
      const updated = await apiJson(`/api/conversations/${conversationId}/messages/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ content, iv }),
      });
      setMessages((prev) => prev.map((m) => (m.id === id ? updated : m)));
      setDecrypted((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      cancelEdit();
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteMessage(id) {
    if (!window.confirm("Delete this message? This can't be undone.")) return;
    try {
      const updated = await apiJson(`/api/conversations/${conversationId}/messages/${id}`, { method: "DELETE" });
      setMessages((prev) => prev.map((m) => (m.id === id ? updated : m)));
    } catch (err) {
      setError(err.message);
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

  // Picking a file only *stages* it -- same "type, then explicitly
  // send" shape as a text message, instead of uploading the instant the
  // OS file picker closes with no chance to check what you grabbed or
  // back out. The actual upload happens in sendPendingFile, only once
  // the Send button (or Enter) confirms it.
  function onFilePicked(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow picking the same file again later
    if (!file) return;
    setError("");
    setPendingFile(file);
    setPendingFilePreviewUrl(file.type.startsWith("image/") ? URL.createObjectURL(file) : null);
  }

  function cancelPendingFile() {
    if (pendingFilePreviewUrl) URL.revokeObjectURL(pendingFilePreviewUrl);
    setPendingFile(null);
    setPendingFilePreviewUrl(null);
  }

  async function sendPendingFile() {
    if (!pendingFile) return;
    const file = pendingFile;
    const previewUrl = pendingFilePreviewUrl;
    setPendingFile(null);
    setPendingFilePreviewUrl(null);
    setError("");
    setUploadingFile(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await apiFetch(`/api/conversations/${conversationId}/messages/file`, { method: "POST", body: fd });
      if (res.ok) {
        const message = await res.json();
        setMessages((prev) => [...prev, message]);
      } else {
        const body = await res.json().catch(() => null);
        setError(body?.detail || "Failed to upload file.");
      }
    } catch {
      setError("Failed to upload file.");
    } finally {
      setUploadingFile(false);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    }
  }

  if (error && !conversation) {
    return <div className="container" style={{ paddingTop: "var(--space-16)" }}><div className="error-banner">{error}</div></div>;
  }
  if (!conversation) return <div style={{ padding: "var(--space-8)" }}>Loading…</div>;

  // Instant join: either side can start the call whenever they're both
  // ready, not just within a lead-time window before the scheduled start
  // -- the backend never enforced that window itself (see
  // signaling_ws.py, which only checks the session is still
  // scheduled/in-progress, never the clock), it was purely this button
  // being disabled. scheduled_start_utc is still shown so it's clear
  // when the session was actually booked for.
  const startsAt = upcomingSession ? new Date(upcomingSession.scheduled_start_utc) : null;
  const joinEarly = startsAt && startsAt.getTime() > Date.now();

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "var(--space-2)", padding: "var(--space-5) var(--space-6)", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
          <Link to="/messages" className="chat-back-btn" aria-label="Back to conversations">
            <ArrowLeft size={20} />
          </Link>
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
            to={`/session/${upcomingSession.id}`}
            className="btn btn-primary btn-sm"
            title={joinEarly ? `Scheduled for ${startsAt.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })} — join early if you're both ready` : "Join now"}
          >
            <Video size={16} />
            Join session
          </Link>
        )}
      </div>

      {error && <div className="error-banner" style={{ margin: "var(--space-3) var(--space-6) 0" }}>{error}</div>}

      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "var(--space-5) var(--space-6)", display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
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
          const isEditing = editingId === m.id;

          if (m.deleted_at) {
            return (
              <div key={m.id} style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "75%" }}>
                <div className="chat-bubble" style={{ fontStyle: "italic", color: "var(--text-tertiary)", background: "var(--surface-alt)" }}>
                  This message was deleted.
                </div>
              </div>
            );
          }

          // For an encrypted message (m.iv set): show the decrypted text
          // once the cache has it, a muted placeholder while that's still
          // in flight, or a "can't decrypt here" note if it failed (e.g.
          // this message was encrypted for a private key that only lives
          // on a different device/browser -- see crypto/e2e.js).
          let textContent = m.content;
          if (m.type === "text" && m.iv) {
            if (!(m.id in decrypted)) textContent = "Decrypting…";
            else if (decrypted[m.id] === null) textContent = "Can't decrypt this message on this device.";
            else textContent = decrypted[m.id];
          }

          return (
            <div key={m.id} className="chat-message-row" style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "75%" }}>
              {mine && !isEditing && (
                <div className="chat-message-actions">
                  {m.type === "text" && (
                    <button type="button" onClick={() => startEdit(m)} aria-label="Edit message" title="Edit">
                      <Pencil size={13} />
                    </button>
                  )}
                  <button type="button" onClick={() => deleteMessage(m.id)} aria-label="Delete message" title="Delete">
                    <Trash2 size={13} />
                  </button>
                </div>
              )}

              {isEditing ? (
                <div className="chat-bubble chat-bubble-mine" style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
                  <input
                    autoFocus
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveEdit(m.id);
                      if (e.key === "Escape") cancelEdit();
                    }}
                    style={{ background: "transparent", border: "none", color: "inherit", outline: "none", flex: 1, minWidth: 120, font: "inherit" }}
                  />
                  <button type="button" onClick={() => saveEdit(m.id)} aria-label="Save edit" style={{ display: "flex", color: "inherit" }}>
                    <Check size={16} />
                  </button>
                  <button type="button" onClick={cancelEdit} aria-label="Cancel edit" style={{ display: "flex", color: "inherit" }}>
                    <XIcon size={16} />
                  </button>
                </div>
              ) : (
                <div className={`chat-bubble ${mine ? "chat-bubble-mine" : "chat-bubble-theirs"}`}>
                  {m.type === "voice" ? (
                    <audio controls src={`${API_BASE}${m.content_url}`} style={{ maxWidth: "220px" }} />
                  ) : m.type === "file" ? (
                    m.file_mime?.startsWith("image/") ? (
                      <a href={`${API_BASE}${m.content_url}`} target="_blank" rel="noreferrer">
                        <img src={`${API_BASE}${m.content_url}`} alt={m.file_name} style={{ maxWidth: 220, maxHeight: 220, borderRadius: "var(--space-2)", display: "block" }} />
                      </a>
                    ) : (
                      <a
                        href={`${API_BASE}${m.content_url}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", color: "inherit", textDecoration: "none" }}
                      >
                        <FileText size={22} style={{ flexShrink: 0 }} />
                        <span style={{ minWidth: 0 }}>
                          <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.file_name}</span>
                          <span style={{ display: "block", fontSize: "var(--text-eyebrow)", opacity: 0.75 }}>{fmtFileSize(m.file_size)}</span>
                        </span>
                        <Download size={16} style={{ flexShrink: 0, marginLeft: "var(--space-1)" }} />
                      </a>
                    )
                  ) : (
                    <span>{textContent}</span>
                  )}
                </div>
              )}
              <p className="field-hint" style={{ margin: "var(--space-1) var(--space-2) 0", textAlign: mine ? "right" : "left" }}>
                {fmtTime(m.created_at)}
                {m.edited_at && " · edited"}
              </p>
            </div>
          );
        })}
      </div>

      <div style={{ borderTop: "1px solid var(--border)" }}>
        {pendingFile && (
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", padding: "var(--space-3) var(--space-6) 0" }}>
            {pendingFilePreviewUrl ? (
              <img src={pendingFilePreviewUrl} alt="" style={{ width: 44, height: 44, objectFit: "cover", borderRadius: "var(--space-2)" }} />
            ) : (
              <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, borderRadius: "var(--space-2)", background: "var(--surface-alt)" }}>
                <FileText size={20} />
              </span>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "var(--text-body-sm)", fontWeight: 600 }}>{pendingFile.name}</p>
              <p className="field-hint" style={{ margin: 0 }}>{fmtFileSize(pendingFile.size)} · ready to send</p>
            </div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={cancelPendingFile} disabled={uploadingFile}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={sendPendingFile} disabled={uploadingFile}>
              <Send size={16} />
              {uploadingFile ? "Sending…" : "Send file"}
            </button>
          </div>
        )}

        <form onSubmit={sendText} style={{ display: "flex", gap: "var(--space-2)", padding: "var(--space-4) var(--space-6)" }}>
          <input ref={fileInputRef} type="file" hidden onChange={onFilePicked} />
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingFile}
            aria-label="Attach a file"
            title="Attach a file"
          >
            <Paperclip size={16} />
          </button>
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
          placeholder={uploadingFile ? "Uploading file…" : "Type a message…"}
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
    </div>
  );
}
