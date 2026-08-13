import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiJson, API_BASE } from "../api/client";
import { usePresence } from "../hooks/usePresence";
import PresenceDot from "../components/PresenceDot";

function formatOverlap(minutes) {
  if (minutes === 0) return "No overlapping free time yet";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours ? `${hours}h ` : ""}${mins}m overlap / week`;
}

export default function BrowsePage() {
  const [matches, setMatches] = useState(null);
  const [error, setError] = useState("");
  const [messaging, setMessaging] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    apiJson("/api/matches")
      .then(setMatches)
      .catch((e) => setError(e.message));
  }, []);

  const presence = usePresence(matches?.map((m) => m.user.id));

  async function startConversation(otherUserId) {
    setMessaging(otherUserId);
    try {
      const conv = await apiJson("/api/conversations", { method: "POST", body: JSON.stringify({ other_user_id: otherUserId }) });
      navigate(`/messages/${conv.id}`);
    } catch (e) {
      setError(e.message);
    } finally {
      setMessaging(null);
    }
  }

  return (
    <div className="container" style={{ paddingTop: "var(--space-10)", paddingBottom: "var(--space-20)" }}>
      <p className="eyebrow">Discover</p>
      <h1>Your matches</h1>
      <p>People who teach what you want to learn, and want to learn what you teach.</p>

      {error && <div className="error-banner">{error}</div>}

      {matches === null && !error && <p>Loading matches…</p>}

      {matches?.length === 0 && (
        <div className="card" style={{ padding: "var(--space-8)" }}>
          <p>
            No mutual matches yet. Make sure you've tagged both skills you can teach and skills you want to learn on
            your <Link to="/profile">profile</Link> — matching needs both sides filled in.
          </p>
        </div>
      )}

      <div style={{ display: "grid", gap: "var(--space-5)", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
        {matches?.map((m) => (
          <div key={m.user.id} className="card" style={{ padding: "var(--space-6)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", marginBottom: "var(--space-4)" }}>
              <div style={{ position: "relative", flexShrink: 0 }}>
                <img
                  src={m.user.photo_url ? `${API_BASE}${m.user.photo_url}` : `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(m.user.name)}`}
                  alt=""
                  width={44}
                  height={44}
                  style={{ borderRadius: "999px", objectFit: "cover", border: "1px solid var(--border)" }}
                />
                <PresenceDot online={!!presence[m.user.id]} style={{ position: "absolute", bottom: 0, right: 0 }} />
              </div>
              <div>
                <strong>{m.user.name}</strong>
                <p className="field-hint" style={{ margin: 0 }}>{m.user.timezone}</p>
              </div>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", marginBottom: "var(--space-3)" }}>
              {m.they_teach_you.map((s) => (
                <span key={`t-${s}`} className="tag tag-teach">Teaches: {s}</span>
              ))}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", marginBottom: "var(--space-4)" }}>
              {m.you_teach_them.map((s) => (
                <span key={`l-${s}`} className="tag tag-learn">Wants: {s}</span>
              ))}
            </div>

            <p className="field-hint">{formatOverlap(m.overlap_minutes)}</p>
            <div style={{ display: "flex", gap: "var(--space-2)" }}>
              <Link to={`/book/${m.user.id}`} className="btn btn-primary btn-sm" style={{ flex: 1 }}>
                Book
              </Link>
              <button
                className="btn btn-secondary btn-sm"
                style={{ flex: 1 }}
                disabled={messaging === m.user.id}
                onClick={() => startConversation(m.user.id)}
              >
                Message
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
