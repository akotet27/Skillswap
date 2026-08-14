import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { apiJson } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useCall } from "../context/CallContext";

/** This page's only job now is the *pre-call* setup (load the session,
 * ask a guest for their name) and then handing off to CallContext -- the
 * actual call UI is drawn by PersistentCallOverlay.jsx, mounted once at
 * the app root so it survives navigating away from this route entirely
 * (see CallContext.jsx). Once startCall() fires, this page has nothing
 * left to render; the overlay takes over visually. */
export default function SessionRoomPage() {
  const { sessionId } = useParams();
  const [searchParams] = useSearchParams();
  const guestToken = searchParams.get("guest_token");
  const guestRoom = searchParams.get("room");
  const { user } = useAuth();
  const { activeCall, startCall, restore } = useCall();

  const [session, setSession] = useState(null);
  const [error, setError] = useState("");
  const [guestNameInput, setGuestNameInput] = useState("");
  const [guestReady, setGuestReady] = useState(false);

  const isGuestFlow = !!guestToken;

  useEffect(() => {
    if (isGuestFlow) return;
    apiJson(`/api/sessions/${sessionId}`)
      .then(setSession)
      .catch((e) => setError(e.message));
  }, [sessionId, isGuestFlow]);

  // Hand off to CallContext once we have what we need. If this exact
  // call is already active (e.g. it was minimized and they navigated
  // back), just bring it back to full size instead of tearing down and
  // reconnecting the WebRTC session from scratch.
  useEffect(() => {
    if (isGuestFlow) {
      if (!guestReady || !guestRoom) return;
      startCall({
        roomId: guestRoom, token: null, guestToken, guestName: guestNameInput,
        selfName: guestNameInput, sessionId: null, isGuestFlow: true,
      });
      return;
    }
    if (!session) return;
    if (activeCall?.sessionId === session.id) {
      restore();
      return;
    }
    startCall({
      roomId: session.video_room_id,
      token: localStorage.getItem("skillswap-access-token"),
      guestToken: undefined,
      guestName: undefined,
      selfName: user?.name || "You",
      sessionId: session.id,
      isGuestFlow: false,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, isGuestFlow, guestReady, guestRoom, guestToken, guestNameInput]);

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

  // Nothing to render here once the handoff above has fired --
  // PersistentCallOverlay is already showing the call full-size, since
  // we're on this exact route.
  return null;
}
