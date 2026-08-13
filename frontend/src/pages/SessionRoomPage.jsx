import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Copy, Check } from "lucide-react";
import { apiJson } from "../api/client";
import { useAuth } from "../context/AuthContext";
import VideoRoom from "../components/video/VideoRoom";

export default function SessionRoomPage() {
  const { sessionId } = useParams();
  const [searchParams] = useSearchParams();
  const guestToken = searchParams.get("guest_token");
  const guestRoom = searchParams.get("room");
  const { user } = useAuth();

  const [session, setSession] = useState(null);
  const [error, setError] = useState("");
  const [guestNameInput, setGuestNameInput] = useState("");
  const [guestReady, setGuestReady] = useState(false);
  const [inviteUrl, setInviteUrl] = useState(null);
  const [copied, setCopied] = useState(false);
  const [left, setLeft] = useState(false);

  const isGuestFlow = !!guestToken;

  useEffect(() => {
    if (isGuestFlow) return;
    apiJson(`/api/sessions/${sessionId}`)
      .then(setSession)
      .catch((e) => setError(e.message));
  }, [sessionId, isGuestFlow]);

  async function inviteGuest() {
    setError("");
    try {
      const res = await apiJson(`/api/sessions/${sessionId}/guest-invite`, { method: "POST" });
      setInviteUrl(res.join_url);
      setCopied(false);
    } catch (e) {
      setError(e.message);
    }
  }

  async function copyInvite() {
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
  }

  if (left) {
    return (
      <div className="container" style={{ maxWidth: 480, paddingTop: "var(--space-16)", textAlign: "center" }}>
        <h1 style={{ fontSize: "var(--text-heading)" }}>You left the call</h1>
        <p>You can close this tab, or rejoin using the same link.</p>
        <button className="btn btn-primary" onClick={() => setLeft(false)}>Rejoin</button>
      </div>
    );
  }

  // Guest flow: ask for a display name before ever opening the signaling
  // socket (the guest token only grants room access -- see
  // app/services/video.py -- the name itself is never signed).
  if (isGuestFlow && !guestReady) {
    if (!guestRoom) {
      return (
        <div className="container" style={{ maxWidth: 440, paddingTop: "var(--space-16)" }}>
          <div className="error-banner">This invite link is missing its room reference. Ask for a fresh link.</div>
        </div>
      );
    }
    return (
      <div className="container" style={{ maxWidth: 440, paddingTop: "var(--space-16)" }}>
        <p className="eyebrow">You've been invited</p>
        <h1 style={{ fontSize: "var(--text-heading)" }}>Join as a guest</h1>
        <p>You're joining as an observer — guests get full video/audio/chat, but don't affect anyone's credits.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (guestNameInput.trim()) setGuestReady(true);
          }}
          className="card"
          style={{ padding: "var(--space-8)" }}
        >
          <div className="field">
            <label htmlFor="guest-name">Your name</label>
            <input id="guest-name" required autoFocus value={guestNameInput} onChange={(e) => setGuestNameInput(e.target.value)} />
          </div>
          <button className="btn btn-primary btn-block">Join call</button>
        </form>
      </div>
    );
  }

  if (!isGuestFlow) {
    if (error) {
      return (
        <div className="container" style={{ maxWidth: 440, paddingTop: "var(--space-16)" }}>
          <div className="error-banner">{error}</div>
        </div>
      );
    }
    if (!session) {
      return <div className="container" style={{ paddingTop: "var(--space-16)" }}>Loading…</div>;
    }
  }

  const roomId = isGuestFlow ? guestRoom : session.video_room_id;
  const accessToken = isGuestFlow ? null : localStorage.getItem("skillswap-access-token");

  return (
    <div className="container" style={{ paddingTop: "var(--space-6)", paddingBottom: "var(--space-10)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-4)", flexWrap: "wrap", gap: "var(--space-3)" }}>
        <h1 style={{ fontSize: "var(--text-heading-sm)", margin: 0 }}>
          {isGuestFlow ? "Video call" : "Session video call"}
        </h1>
        {!isGuestFlow && !inviteUrl && (
          <button className="btn btn-secondary btn-sm" onClick={inviteGuest}>
            Invite a guest
          </button>
        )}
        {inviteUrl && (
          <div className="card" style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", padding: "var(--space-2) var(--space-3)" }}>
            <input readOnly value={inviteUrl} style={{ border: "none", width: 260, fontSize: "var(--text-body-sm)" }} />
            <button className="btn btn-secondary btn-sm" onClick={copyInvite} aria-label="Copy invite link">
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
        )}
      </div>

      {error && <div className="error-banner">{error}</div>}

      <VideoRoom
        roomId={roomId}
        token={accessToken}
        guestToken={isGuestFlow ? guestToken : undefined}
        guestName={isGuestFlow ? guestNameInput : undefined}
        selfName={isGuestFlow ? guestNameInput : user?.name || "You"}
        onLeave={() => setLeft(true)}
      />
    </div>
  );
}
