import { useState } from "react";
import { X } from "lucide-react";
import { apiJson } from "../api/client";

const REASONS = ["No-show", "Inappropriate behavior", "Didn't teach the agreed skill", "Other"];

/** "Report this user" -- available after a completed session (see
 * SessionsPage.jsx). Creates a Report row tied to the session; an admin
 * reviews it from the moderation queue (AdminPage.jsx). Simple modal, not
 * a full page -- this is a rare, low-frequency action. */
export default function ReportUserModal({ sessionId, otherName, onClose, onSubmitted }) {
  const [reason, setReason] = useState(REASONS[0]);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await apiJson(`/api/sessions/${sessionId}/report`, {
        method: "POST",
        body: JSON.stringify({ reason, note: note.trim() || null }),
      });
      onSubmitted();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{ position: "fixed", inset: 0, background: "rgba(13,17,27,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300, padding: "var(--space-4)" }}
      onClick={onClose}
    >
      <div className="card" style={{ padding: "var(--space-8)", maxWidth: 420, width: "100%" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "var(--space-4)" }}>
          <h3 style={{ margin: 0 }}>Report {otherName}</h3>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)" }}>
            <X size={18} />
          </button>
        </div>

        {error && <div className="error-banner">{error}</div>}

        <form onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="report-reason">Reason</label>
            <select id="report-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
              {REASONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="report-note">Additional details (optional)</label>
            <textarea id="report-note" rows={3} className="input" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div style={{ display: "flex", gap: "var(--space-3)" }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? "Sending…" : "Submit report"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
