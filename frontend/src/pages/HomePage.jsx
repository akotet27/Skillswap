import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { apiJson, API_BASE } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { formatCredits } from "../utils/credits";

/** The authenticated home feed ("/home") -- credits, upcoming sessions,
 * suggested matches. No marketing content here; that's LandingPage.jsx
 * ("/"), which a logged-in user never sees (see App.jsx's root-route
 * guard). This is where login/signup land, same as opening Instagram
 * already signed in takes you straight to your feed, never back to its
 * own sign-up pitch.
 *
 * Two-column on wide viewports (main content + a right-hand rail for
 * credits/stats) rather than one narrow centered column with large empty
 * gutters either side -- the rail moves *above* the main content on
 * narrow viewports via `order`, not just disappearing. */

const MAX_UPCOMING = 3;
const MAX_SUGGESTED = 4;

function fmt(iso) {
  return new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function fmtShort(iso) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function HomePage() {
  const { user: me } = useAuth();
  const [credits, setCredits] = useState(null);
  const [sessions, setSessions] = useState(null);
  const [matches, setMatches] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([apiJson("/api/credits/me"), apiJson("/api/sessions/me"), apiJson("/api/matches")])
      .then(([c, s, m]) => {
        setCredits(c);
        setSessions(s);
        setMatches(m);
      })
      .catch((e) => setError(e.message));
  }, []);

  const upcoming = sessions
    ?.filter((s) => (s.status === "scheduled" || s.status === "in_progress") && new Date(s.scheduled_end_utc).getTime() > Date.now())
    .sort((a, b) => new Date(a.scheduled_start_utc) - new Date(b.scheduled_start_utc))
    .slice(0, MAX_UPCOMING);

  const completedCount = sessions?.filter((s) => s.status === "completed").length ?? null;
  const suggested = matches?.slice(0, MAX_SUGGESTED);
  const badges = me.badges || [];

  // Last 8 ledger entries, oldest-first, for the activity chart -- each
  // bar is signed (earned/refunded positive, spent negative) so the
  // shape of recent activity is visible at a glance.
  const chartData = credits?.transactions
    .slice(0, 8)
    .reverse()
    .map((t) => ({ date: fmtShort(t.created_at), amount: t.amount, type: t.type }));

  return (
    <div className="container" style={{ paddingTop: "var(--space-10)", paddingBottom: "var(--space-20)" }}>
      <p className="eyebrow">Home</p>
      <h1>Welcome back, {me.name.split(" ")[0]}</h1>

      {error && <div className="error-banner">{error}</div>}

      <div className="home-grid">
        {/* --- Main column --- */}
        <div>
          <section style={{ marginBottom: "var(--space-10)" }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "var(--space-4)" }}>
              <h2 style={{ margin: 0 }}>Upcoming sessions</h2>
              <Link to="/sessions">See all</Link>
            </div>
            {upcoming === undefined && <p className="field-hint">Loading…</p>}
            {upcoming?.length === 0 && (
              <p className="field-hint">Nothing scheduled yet -- accept a swap request, or send one from a match below.</p>
            )}
            <div style={{ display: "grid", gap: "var(--space-3)" }}>
              {upcoming?.map((s) => {
                const teacher = s.participants.find((p) => p.role === "teacher");
                const learner = s.participants.find((p) => p.role === "learner");
                const iAmLearner = learner?.user.id === me.id;
                return (
                  <div key={s.id} className="card" style={{ padding: "var(--space-5) var(--space-6)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "var(--space-3)" }}>
                    <div>
                      <p style={{ margin: 0 }}>
                        <strong>{teacher?.user.name}</strong> teaches <strong>{learner?.user.name}</strong>{" "}
                        <span className={`tag ${iAmLearner ? "tag-learn" : "tag-teach"}`}>{iAmLearner ? "you're learning" : "you're teaching"}</span>
                      </p>
                      <p className="field-hint" style={{ margin: "var(--space-1) 0 0" }}>{fmt(s.scheduled_start_utc)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "var(--space-4)" }}>
              <h2 style={{ margin: 0 }}>Suggested matches</h2>
              <Link to="/browse">Browse all</Link>
            </div>
            {suggested === undefined && <p className="field-hint">Loading…</p>}
            {suggested?.length === 0 && (
              <p className="field-hint">
                No mutual matches yet -- make sure you've tagged both skills you can teach and skills you want to
                learn on your <Link to="/profile">profile</Link>.
              </p>
            )}
            <div style={{ display: "grid", gap: "var(--space-4)", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
              {suggested?.map((m) => (
                <div key={m.user.id} className="card" style={{ padding: "var(--space-5)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", marginBottom: "var(--space-4)" }}>
                    <img
                      src={m.user.photo_url ? `${API_BASE}${m.user.photo_url}` : `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(m.user.name)}`}
                      alt=""
                      width={36}
                      height={36}
                      style={{ borderRadius: "999px", objectFit: "cover", border: "1px solid var(--border)" }}
                    />
                    <strong style={{ fontSize: "var(--text-body-sm)" }}>{m.user.name}</strong>
                  </div>
                  <Link to={`/book/${m.user.id}`} className="btn btn-primary btn-sm btn-block">Send swap request</Link>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* --- Right rail: credits, activity chart, quick stats --- */}
        <aside className="home-rail">
          <div className="card" style={{ padding: "var(--space-6)" }}>
            <span className="eyebrow">Credits</span>
            {credits ? (
              <>
                <p style={{ margin: "var(--space-2) 0 0", fontSize: "var(--text-heading-sm)", color: "var(--color-electric-blue)", fontWeight: 600 }}>
                  {formatCredits(credits.balance)} available
                </p>
                <p className="field-hint" style={{ margin: "var(--space-1) 0 var(--space-4)" }}>
                  {credits.pending_balance > 0
                    ? `${formatCredits(credits.pending_balance)} more pending escrow -- releases 24h after your session`
                    : "None pending escrow right now"}
                </p>
                {chartData?.length > 0 && (
                  <div style={{ height: 120, margin: "0 calc(var(--space-2) * -1)" }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--text-tertiary)" }} axisLine={false} tickLine={false} />
                        <Tooltip
                          cursor={{ fill: "var(--surface-alt)" }}
                          contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--space-2)", fontSize: 12 }}
                        />
                        <Bar dataKey="amount" radius={[4, 4, 4, 4]}>
                          {chartData.map((entry, i) => (
                            <Cell key={i} fill={entry.amount >= 0 ? "var(--color-leaf)" : "var(--color-coral)"} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </>
            ) : (
              <p className="field-hint" style={{ marginTop: "var(--space-2)" }}>Loading…</p>
            )}
          </div>

          <div className="card" style={{ padding: "var(--space-6)" }}>
            <span className="eyebrow">Quick stats</span>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", marginTop: "var(--space-3)" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span className="field-hint" style={{ margin: 0 }}>Sessions completed</span>
                <strong>{completedCount ?? "…"}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span className="field-hint" style={{ margin: 0 }}>Badges earned</span>
                <strong>{badges.length}</strong>
              </div>
            </div>
            {badges.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", marginTop: "var(--space-4)" }}>
                {badges.map((b) => (
                  <span key={b.badge_key} className="tag tag-neutral" title={b.label}>{b.label}</span>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
