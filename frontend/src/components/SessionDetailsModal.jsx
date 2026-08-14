import { Link } from "react-router-dom";
import { X, Video } from "lucide-react";

function fmtFull(iso) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}
function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

const STATUS_LABELS = {
  scheduled: "Scheduled",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No-show",
};

/** What/when/who for one session, plus an instant-join action -- clicking
 * a session card on SessionsPage.jsx opens this instead of cramming the
 * detail into the card itself. Join is never time-gated (see
 * ChatPage.jsx's matching "Join session" button) -- the backend only
 * checks the session is still scheduled/in_progress, never the clock, so
 * there's no reason this button should be either. */
export default function SessionDetailsModal({ session, onClose }) {
  const teacher = session.participants.find((p) => p.role === "teacher");
  const learner = session.participants.find((p) => p.role === "learner");
  const joinable = session.status === "scheduled" || session.status === "in_progress";

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{ position: "fixed", inset: 0, background: "rgba(13,17,27,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300, padding: "var(--space-4)" }}
      onClick={onClose}
    >
      <div className="card" style={{ padding: "var(--space-8)", maxWidth: 440, width: "100%" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "var(--space-5)" }}>
          <div>
            <span className="tag tag-neutral">{STATUS_LABELS[session.status] || session.status}</span>
            <h3 style={{ margin: "var(--space-3) 0 0" }}>{session.skill?.name || "Session"}</h3>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)" }}>
            <X size={18} />
          </button>
        </div>

        <dl style={{ margin: 0, display: "grid", gap: "var(--space-4)" }}>
          <div>
            <dt className="eyebrow" style={{ marginBottom: "var(--space-1)" }}>What</dt>
            <dd style={{ margin: 0 }}>
              <span className="tag tag-teach">{teacher?.user.name} teaches</span>{" "}
              <span className="tag tag-learn">{learner?.user.name} learns</span>{" "}
              — {session.skill?.name || "a skill"}
            </dd>
          </div>
          <div>
            <dt className="eyebrow" style={{ marginBottom: "var(--space-1)" }}>When</dt>
            <dd style={{ margin: 0 }}>
              {fmtFull(session.scheduled_start_utc)} – {fmtTime(session.scheduled_end_utc)}
            </dd>
          </div>
          <div>
            <dt className="eyebrow" style={{ marginBottom: "var(--space-1)" }}>Who</dt>
            <dd style={{ margin: 0 }}>{teacher?.user.name} and {learner?.user.name}</dd>
          </div>
        </dl>

        <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-6)" }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>
          {joinable && (
            <Link to={`/session/${session.id}`} className="btn btn-primary" style={{ flex: 1, justifyContent: "center" }}>
              <Video size={16} />
              Join now
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
