import { useEffect, useState } from "react";
import { apiJson } from "../api/client";
import { useNotifications } from "../context/NotificationsContext";

function fmt(iso) {
  return new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function RequestsPage() {
  const [mode, setMode] = useState("incoming");
  const [requests, setRequests] = useState(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const { refreshPendingRequestsTotal } = useNotifications();

  async function load() {
    try {
      setRequests(await apiJson(`/api/swap-requests?mode=${mode}`));
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    setRequests(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Visiting this page at all (even just switching tabs) is a reasonable
  // moment to double-check the sidebar badge is accurate -- cheap, and
  // catches it up if it ever drifted (e.g. acted on a request from a
  // different tab/device).
  useEffect(() => {
    refreshPendingRequestsTotal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function act(id, action) {
    setError("");
    setBusyId(id);
    try {
      await apiJson(`/api/swap-requests/${id}/${action}`, { method: "POST" });
      await load();
      refreshPendingRequestsTotal();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="container" style={{ paddingTop: "var(--space-10)", paddingBottom: "var(--space-20)" }}>
      <p className="eyebrow">Swap requests</p>
      <h1>Requests</h1>

      <div style={{ display: "flex", gap: "var(--space-2)", marginBottom: "var(--space-6)" }}>
        <button className={`btn btn-sm ${mode === "incoming" ? "btn-primary" : "btn-secondary"}`} onClick={() => setMode("incoming")}>
          Incoming
        </button>
        <button className={`btn btn-sm ${mode === "outgoing" ? "btn-primary" : "btn-secondary"}`} onClick={() => setMode("outgoing")}>
          Sent
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {requests === null && <p>Loading…</p>}
      {requests?.length === 0 && <p>No {mode} requests.</p>}

      <div style={{ display: "grid", gap: "var(--space-4)" }}>
        {requests?.map((r) => (
          <div key={r.id} className="card" style={{ padding: "var(--space-6)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "var(--space-3)" }}>
            <div>
              <p style={{ margin: 0 }}>
                <span className="tag tag-learn">Learn: {r.skill_learned.name}</span>{" "}
                <span className="tag tag-teach">In return: {r.skill_taught.name}</span>
              </p>
              <p className="field-hint" style={{ margin: "var(--space-2) 0 0" }}>{fmt(r.proposed_start_utc)} — status: {r.status}</p>
            </div>
            {mode === "incoming" && r.status === "pending" && (
              <div style={{ display: "flex", gap: "var(--space-2)" }}>
                <button className="btn btn-primary btn-sm" disabled={busyId === r.id} onClick={() => act(r.id, "accept")}>
                  Accept
                </button>
                <button className="btn btn-secondary btn-sm" disabled={busyId === r.id} onClick={() => act(r.id, "decline")}>
                  Decline
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
