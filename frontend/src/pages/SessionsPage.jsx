import { useEffect, useState } from "react";
import { apiJson } from "../api/client";
import { useAuth } from "../context/AuthContext";
import ReportUserModal from "../components/ReportUserModal";
import { formatCredits } from "../utils/credits";

function fmt(iso) {
  return new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function SessionsPage() {
  const { user: me } = useAuth();
  const [sessions, setSessions] = useState(null);
  const [credits, setCredits] = useState(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [reportTarget, setReportTarget] = useState(null); // { sessionId, otherName } | null
  const [reportedIds, setReportedIds] = useState(new Set());

  async function load() {
    try {
      const [s, c] = await Promise.all([apiJson("/api/sessions/me"), apiJson("/api/credits/me")]);
      setSessions(s);
      setCredits(c);
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function cancel(id) {
    setError("");
    setBusyId(id);
    try {
      await apiJson(`/api/sessions/${id}/cancel`, { method: "POST" });
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  }

  async function confirmComplete(id) {
    setError("");
    setBusyId(id);
    try {
      await apiJson(`/api/sessions/${id}/complete`, { method: "POST" });
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="container" style={{ paddingTop: "var(--space-10)", paddingBottom: "var(--space-20)" }}>
      <p className="eyebrow">Your schedule</p>
      <h1>Sessions</h1>

      {credits && (
        <div className="card" style={{ padding: "var(--space-5) var(--space-6)", marginBottom: "var(--space-6)", display: "inline-block" }}>
          <span className="eyebrow">Credit balance</span>
          <p style={{ margin: 0, fontSize: "var(--text-heading-sm)", color: "var(--color-electric-blue)", fontWeight: 600 }}>{formatCredits(credits.balance)}</p>
          {credits.pending_balance > 0 && (
            <p className="field-hint" style={{ margin: "var(--space-1) 0 0" }}>
              {formatCredits(credits.pending_balance)} teaching credit{credits.pending_balance === 1 ? "" : "s"} pending escrow
            </p>
          )}
        </div>
      )}

      {error && <div className="error-banner">{error}</div>}
      {sessions === null && <p>Loading…</p>}
      {sessions?.length === 0 && <p>No sessions yet — accept a swap request to schedule one.</p>}

      <div style={{ display: "grid", gap: "var(--space-4)" }}>
        {sessions?.map((s) => {
          const teacher = s.participants.find((p) => p.role === "teacher");
          const learner = s.participants.find((p) => p.role === "learner");
          const iAmLearner = learner?.user.id === me.id;
          const started = new Date(s.scheduled_start_utc).getTime() <= Date.now();
          const canWrapUp = iAmLearner && started && (s.status === "scheduled" || s.status === "in_progress");
          const other = iAmLearner ? teacher : learner;
          const canReport = s.status === "completed" && !reportedIds.has(s.id) && other;
          return (
            <div key={s.id} className="card" style={{ padding: "var(--space-6)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "var(--space-3)" }}>
              <div>
                <p style={{ margin: 0 }}>
                  <strong>{teacher?.user.name}</strong> teaches <strong>{learner?.user.name}</strong>
                  {" "}<span className={`tag ${iAmLearner ? "tag-learn" : "tag-teach"}`}>{iAmLearner ? "you're learning" : "you're teaching"}</span>
                </p>
                <p className="field-hint" style={{ margin: "var(--space-2) 0 0" }}>{fmt(s.scheduled_start_utc)} — {s.status}</p>
              </div>
              <div style={{ display: "flex", gap: "var(--space-2)" }}>
                {canWrapUp && (
                  <button className="btn btn-primary btn-sm" disabled={busyId === s.id} onClick={() => confirmComplete(s.id)} title="Confirms the session happened, so your teacher's credit starts its 24h hold">
                    Mark complete
                  </button>
                )}
                {s.status === "scheduled" && (
                  <button className="btn btn-secondary btn-sm" disabled={busyId === s.id} onClick={() => cancel(s.id)}>
                    Cancel
                  </button>
                )}
                {canReport && (
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => setReportTarget({ sessionId: s.id, otherName: other.user.name })}
                  >
                    Report
                  </button>
                )}
                {s.status === "completed" && reportedIds.has(s.id) && (
                  <span className="field-hint">Reported</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {reportTarget && (
        <ReportUserModal
          sessionId={reportTarget.sessionId}
          otherName={reportTarget.otherName}
          onClose={() => setReportTarget(null)}
          onSubmitted={() => {
            setReportedIds((prev) => new Set(prev).add(reportTarget.sessionId));
            setReportTarget(null);
          }}
        />
      )}
    </div>
  );
}
