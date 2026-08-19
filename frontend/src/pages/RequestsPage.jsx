import { useEffect, useState } from "react";
import { apiJson, API_BASE } from "../api/client";
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
        {requests?.map((r) => {
          // "Who" is whichever side of the request isn't me -- the person
          // who sent it (incoming) or the person I sent it to (outgoing).
          const other = mode === "incoming" ? r.requester : r.recipient;
          return (
          <div key={r.id} className="card" style={{ padding: "var(--space-6)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "var(--space-3)" }}>
            <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "flex-start" }}>
              <img
                src={other.photo_url ? `${API_BASE}${other.photo_url}` : `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(other.name)}`}
                alt=""
                width={40}
                height={40}
                style={{ borderRadius: "999px", objectFit: "cover", border: "1px solid var(--border)", flexShrink: 0 }}
              />
              <div>
                <p style={{ margin: 0 }}>
                  <strong>{other.name}</strong>{" "}
                  <span style={{ color: "var(--text-tertiary)", fontWeight: 400 }}>
                    {mode === "incoming" ? "wants to learn from you" : "you sent this to"}
                  </span>
                </p>
                <p style={{ margin: "var(--space-1) 0 0" }}>
                  <span className="tag tag-learn">Learn: {r.skill_learned.name}</span>{" "}
                  <span className="tag tag-teach">In return: {r.skill_taught.name}</span>
                </p>
                <p className="field-hint" style={{ margin: "var(--space-2) 0 0" }}>{fmt(r.proposed_start_utc)} — status: {r.status}</p>
              </div>
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
          );
        })}
      </div>
    </div>
  );
}
