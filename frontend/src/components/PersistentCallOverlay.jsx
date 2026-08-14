import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Copy, Check, Minimize2, Maximize2 } from "lucide-react";
import { apiJson } from "../api/client";
import { useCall } from "../context/CallContext";
import VideoRoom from "./video/VideoRoom";

/** Renders the one-and-only <VideoRoom/> instance for the whole app,
 * mounted once at the root (see App.jsx) so it survives route
 * navigation -- see CallContext.jsx for why. Shows full-size while
 * you're on the call's own /session/:id route and haven't minimized it;
 * otherwise (minimized, or you've navigated anywhere else) it shrinks to
 * a small floating window in the corner so the call keeps running while
 * you do something else, e.g. check Messages. */
export default function PersistentCallOverlay() {
  const { activeCall, minimized, endCall, minimize, restore } = useCall();
  const location = useLocation();
  const navigate = useNavigate();
  const [inviteUrl, setInviteUrl] = useState(null);
  const [copied, setCopied] = useState(false);

  if (!activeCall) return null;

  const onSessionRoute = !activeCall.isGuestFlow && location.pathname === `/session/${activeCall.sessionId}`;
  const showMini = minimized || !onSessionRoute;

  async function inviteGuest() {
    try {
      const res = await apiJson(`/api/sessions/${activeCall.sessionId}/guest-invite`, { method: "POST" });
      setInviteUrl(res.join_url);
      setCopied(false);
    } catch {
      // Best-effort -- not worth its own error banner over a floating
      // overlay; the button simply doesn't produce a link this time.
    }
  }

  async function copyInvite() {
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
  }

  function handleLeave() {
    endCall();
    navigate("/sessions");
  }

  function expand() {
    restore();
    navigate(`/session/${activeCall.sessionId}`);
  }

  if (showMini) {
    return (
      <div className="call-pip">
        <div className="call-pip-header">
          <span>Call in progress</span>
          <button type="button" onClick={expand} aria-label="Expand call" title="Expand call">
            <Maximize2 size={13} />
          </button>
        </div>
        <VideoRoom {...activeCall} onLeave={handleLeave} compact />
      </div>
    );
  }

  return (
    <div className="call-full-overlay">
      <div className="container" style={{ paddingTop: "var(--space-6)", paddingBottom: "var(--space-10)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-4)", flexWrap: "wrap", gap: "var(--space-3)" }}>
          <h1 style={{ fontSize: "var(--text-heading-sm)", margin: 0 }}>
            {activeCall.isGuestFlow ? "Video call" : "Session video call"}
          </h1>
          <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
            {!activeCall.isGuestFlow && !inviteUrl && (
              <button className="btn btn-secondary btn-sm" onClick={inviteGuest}>
                Invite a guest
              </button>
            )}
            {inviteUrl && (
              <div className="card" style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", padding: "var(--space-2) var(--space-3)" }}>
                <input className="input" readOnly value={inviteUrl} style={{ border: "none", width: 220, fontSize: "var(--text-body-sm)" }} />
                <button className="btn btn-secondary btn-sm" onClick={copyInvite} aria-label="Copy invite link">
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
            )}
            <button className="btn btn-secondary btn-sm" onClick={minimize} title="Keep the call running in the corner while you do other things">
              <Minimize2 size={14} />
              Minimize
            </button>
          </div>
        </div>

        <VideoRoom {...activeCall} onLeave={handleLeave} />
      </div>
    </div>
  );
}
