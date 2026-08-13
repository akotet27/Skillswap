import { Mic, Video, MessageCircle, PhoneOff, X } from "lucide-react";

/** Homepage "in-browser video" showcase -- previously an uploaded PNG
 * screenshot mockup. Rebuilt from the *real* CSS classes the actual video
 * room and chat UI already use (.browser-frame, .chat-bubble, .btn-round
 * -- see SessionRoomPage/ChatPage), so this isn't a generic recreation,
 * it's built from the same pieces as the real feature. DiceBear avatars
 * stand in for "people on a call" instead of stock photos. */

function avatarUrl(seed, bg) {
  return `https://api.dicebear.com/7.x/personas/svg?seed=${encodeURIComponent(seed)}&backgroundColor=${bg}`;
}

const PARTICIPANTS = [
  { name: "Priya S.", seed: "Priya-Video", bg: "cfeafa" },
  { name: "Sam R.", seed: "Sam-Video", bg: "e1e0fc" },
];

export default function VideoSessionShowcase() {
  return (
    <div className="browser-frame">
      <div className="browser-frame-bar">
        <span className="browser-frame-dot" />
        <span className="browser-frame-dot" />
        <span className="browser-frame-dot" />
        <span style={{ marginLeft: "var(--space-2)", fontSize: "var(--text-body-sm)", fontWeight: 600, color: "var(--text-secondary)" }}>
          SkillSwap
        </span>
      </div>

      <div style={{ display: "flex", background: "var(--color-midnight)", minHeight: 300 }}>
        <div style={{ flex: 2, position: "relative", display: "flex" }}>
          {PARTICIPANTS.map((p) => (
            <div
              key={p.name}
              style={{
                flex: 1,
                position: "relative",
                background: "linear-gradient(160deg, #1a1d29, #0d111b)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRight: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <img src={avatarUrl(p.seed, p.bg)} alt="" width={88} height={88} style={{ borderRadius: "50%", background: `#${p.bg}` }} />
              <span
                style={{
                  position: "absolute",
                  bottom: 10,
                  left: 10,
                  background: "rgba(0,0,0,0.55)",
                  color: "#fff",
                  fontSize: "var(--text-eyebrow)",
                  fontWeight: 600,
                  padding: "4px 10px",
                  borderRadius: "var(--radius-pill)",
                }}
              >
                {p.name}
              </span>
            </div>
          ))}

          <div style={{ position: "absolute", bottom: "var(--space-4)", left: "50%", transform: "translateX(-50%)", display: "flex", gap: "var(--space-3)" }}>
            <span className="btn-round" aria-hidden="true"><Mic size={18} /></span>
            <span className="btn-round" aria-hidden="true"><Video size={18} /></span>
            <span className="btn-round" aria-hidden="true"><MessageCircle size={18} /></span>
            <span className="btn-round btn-round-danger" aria-hidden="true"><PhoneOff size={18} /></span>
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 170, background: "var(--surface)", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "var(--space-3) var(--space-4)", borderBottom: "1px solid var(--border)" }}>
            <strong style={{ fontSize: "var(--text-body-sm)", color: "var(--text-heading)" }}>Chat</strong>
            <X size={14} style={{ color: "var(--text-tertiary)" }} />
          </div>
          <div style={{ flex: 1, padding: "var(--space-3)", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            <div className="chat-bubble chat-bubble-theirs" style={{ alignSelf: "flex-start", fontSize: "var(--text-body-sm)" }}>
              Hey, ready?
            </div>
            <div className="chat-bubble chat-bubble-mine" style={{ alignSelf: "flex-end", fontSize: "var(--text-body-sm)" }}>
              Yep, let's go!
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
