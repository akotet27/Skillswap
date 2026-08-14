import { useState } from "react";
import { Mic, MicOff, Video, VideoOff, PhoneOff, Send, Smile, UserPlus, Loader2, AlertTriangle, MonitorUp } from "lucide-react";
import { useWebRTCRoom } from "../../webrtc/useWebRTCRoom";
import VideoTile from "./VideoTile";

const QUICK_REACTIONS = ["👍", "🎉", "😂", "❤️", "👏", "🙌", "🔥", "😮", "👋", "😢"];

export default function VideoRoom({ roomId, token, guestToken, guestName, selfName, onLeave, onInviteGuest }) {
  const {
    connectionState,
    selfId,
    localStream,
    remoteStreams,
    publishStates,
    micEnabled,
    cameraEnabled,
    screenStream,
    screenSharing,
    mediaError,
    chatMessages,
    reactions,
    toggleMic,
    toggleCamera,
    toggleScreenShare,
    sendChat,
    sendReaction,
    hangUp,
  } = useWebRTCRoom({ roomId, token, guestToken, guestName });

  const [chatOpen, setChatOpen] = useState(false);
  const [draft, setDraft] = useState("");

  function submitChat(e) {
    e.preventDefault();
    if (!draft.trim()) return;
    sendChat(draft.trim());
    setDraft("");
  }

  function leave() {
    hangUp();
    onLeave?.();
  }

  const remoteEntries = [...remoteStreams.entries()];
  const screenShareActive = screenSharing && screenStream;

  return (
    <div style={{ position: "relative", background: "var(--color-midnight)", borderRadius: "var(--radius-card)", overflow: "hidden" }}>
      {/* room-state banner -- explicit, not inferred */}
      {connectionState !== "connected" && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "var(--space-2)",
            padding: "var(--space-3)",
            background: connectionState === "failed" ? "var(--color-danger)" : "rgba(0,0,0,0.6)",
            color: "#fff",
            fontSize: "var(--text-body-sm)",
            fontWeight: 600,
          }}
        >
          {connectionState === "connecting" ? (
            <>
              <Loader2 size={16} className="spin" /> Connecting to the call…
            </>
          ) : (
            <>
              <AlertTriangle size={16} /> Couldn't connect. Check your connection and refresh to try again.
            </>
          )}
        </div>
      )}

      {mediaError && (
        <div style={{ position: "absolute", top: connectionState !== "connected" ? 48 : 0, left: 0, right: 0, zIndex: 19, padding: "var(--space-2) var(--space-3)", background: "#5a3b0f", color: "#ffd580", fontSize: "var(--text-eyebrow)", textAlign: "center" }}>
          {mediaError} — you can still watch and chat.
        </div>
      )}

      {/* floating reaction overlay */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 15, overflow: "hidden" }}>
        {reactions.map((r) => (
          <span
            key={r.id}
            className="floating-reaction"
            style={{ position: "absolute", left: `${20 + ((r.from * 37) % 60)}%`, bottom: 60, fontSize: 32 }}
          >
            {r.emoji}
          </span>
        ))}
      </div>

      {screenShareActive ? (
        <div style={{ padding: "var(--space-2)" }}>
          <div style={{ position: "relative" }}>
            <VideoTile stream={screenStream} name="Your screen" status="Sharing screen" style={{ aspectRatio: "16 / 10" }} />
            <div style={{ position: "absolute", right: "var(--space-3)", bottom: "var(--space-3)", width: "clamp(140px, 20vw, 220px)", boxShadow: "var(--shadow-hover)", borderRadius: "var(--radius-card)", overflow: "hidden" }}>
              <VideoTile stream={localStream} name={selfName} isLocal cameraOn={cameraEnabled} style={{ aspectRatio: "4 / 3" }} />
            </div>
          </div>
          {remoteEntries.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: remoteEntries.length === 1 ? "1fr" : "repeat(auto-fit, minmax(240px, 1fr))", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
              {remoteEntries.map(([peerId, info]) => (
                <VideoTile
                  key={peerId}
                  stream={info.stream}
                  name={info.name}
                  publishState={publishStates.get(peerId)}
                  status={info.screenSharing ? "Sharing screen" : undefined}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: remoteEntries.length === 0 ? "1fr" : "repeat(auto-fit, minmax(240px, 1fr))", gap: "var(--space-2)", padding: "var(--space-2)" }}>
          <VideoTile stream={localStream} name={selfName} isLocal cameraOn={cameraEnabled} />
          {remoteEntries.map(([peerId, info]) => (
            <VideoTile
              key={peerId}
              stream={info.stream}
              name={info.name}
              publishState={publishStates.get(peerId)}
              status={info.screenSharing ? "Sharing screen" : undefined}
            />
          ))}
        </div>
      )}

      {/* control bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "var(--space-3)", padding: "var(--space-4)" }}>
        <button className={`btn-round ${!micEnabled ? "btn-round-off" : ""}`} onClick={toggleMic} aria-label={micEnabled ? "Mute microphone" : "Unmute microphone"}>
          {micEnabled ? <Mic size={18} /> : <MicOff size={18} />}
        </button>
        <button className={`btn-round ${!cameraEnabled ? "btn-round-off" : ""}`} onClick={toggleCamera} aria-label={cameraEnabled ? "Turn camera off" : "Turn camera on"}>
          {cameraEnabled ? <Video size={18} /> : <VideoOff size={18} />}
        </button>
        <button className={`btn-round ${screenSharing ? "btn-round-off" : ""}`} onClick={toggleScreenShare} aria-label={screenSharing ? "Stop sharing your screen" : "Share your screen"}>
          <MonitorUp size={18} />
        </button>
        <button className="btn-round" onClick={() => setChatOpen((v) => !v)} aria-label="Toggle chat">
          <Send size={18} />
        </button>
        <div style={{ position: "relative" }}>
          <ReactionPicker onPick={sendReaction} />
        </div>
        {onInviteGuest && (
          <button className="btn-round" onClick={onInviteGuest} aria-label="Invite a guest">
            <UserPlus size={18} />
          </button>
        )}
        <button className="btn-round btn-round-danger" onClick={leave} aria-label="Leave call">
          <PhoneOff size={18} />
        </button>
      </div>

      {chatOpen && (
        <div style={{ background: "var(--surface)", borderTop: "1px solid var(--border)", maxHeight: 240, display: "flex", flexDirection: "column" }}>
          <div style={{ flex: 1, overflowY: "auto", padding: "var(--space-3)", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            {chatMessages.length === 0 && <p className="field-hint" style={{ margin: 0 }}>No messages yet.</p>}
            {chatMessages.map((m) => (
              <p key={m.id} style={{ margin: 0, fontSize: "var(--text-body-sm)" }}>
                <strong style={{ color: m.from === selfId ? "var(--color-electric-blue)" : "var(--text-heading)" }}>{m.from === selfId ? "You" : m.name}:</strong> {m.content}
              </p>
            ))}
          </div>
          <form onSubmit={submitChat} style={{ display: "flex", gap: "var(--space-2)", padding: "var(--space-2) var(--space-3)" }}>
            <input placeholder="Send a message…" value={draft} onChange={(e) => setDraft(e.target.value)} style={{ flex: 1 }} />
            <button className="btn btn-primary btn-sm">Send</button>
          </form>
        </div>
      )}
    </div>
  );
}

function ReactionPicker({ onPick }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn-round" onClick={() => setOpen((v) => !v)} aria-label="Send a reaction">
        <Smile size={18} />
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            bottom: "calc(100% + 8px)",
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            flexWrap: "wrap",
            gap: "var(--space-1)",
            width: 190,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--space-4)",
            padding: "var(--space-2)",
            boxShadow: "var(--shadow-hover)",
          }}
        >
          {QUICK_REACTIONS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => {
                onPick(emoji);
                setOpen(false);
              }}
              style={{ border: "none", background: "none", cursor: "pointer", fontSize: 20, padding: 4 }}
              aria-label={`React with ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
