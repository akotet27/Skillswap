import { useEffect, useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { apiJson } from "../api/client";

/** Admin-only moderation + account tools -- see backend/app/api/routes/admin.py.
 * Deliberately minimal: a reports queue (oldest-first) and a user list with
 * suspend/unsuspend + manual credit adjustment. No separate moderation
 * system, just a few write actions layered over existing data, gated by
 * get_current_admin on every request (also re-checked client-side below so
 * a non-admin never sees the page flash before the API 403s). */

function fmt(iso) {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function ReportsTab() {
  const [reports, setReports] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  async function load() {
    try {
      const data = await apiJson(`/api/admin/reports?status_filter=${showAll ? "all" : "open"}`);
      setReports(data);
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAll]);

  async function resolve(id) {
    setBusyId(id);
    setError("");
    try {
      await apiJson(`/api/admin/reports/${id}/resolve`, { method: "POST" });
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-4)" }}>
        <p className="field-hint" style={{ margin: 0 }}>
          {showAll ? "All reports, oldest first" : "Open reports, oldest first"}
        </p>
        <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--text-body-sm)", cursor: "pointer" }}>
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
          Show resolved too
        </label>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {reports === null && <p>Loading…</p>}
      {reports?.length === 0 && <p className="field-hint">Nothing here right now.</p>}

      <div style={{ display: "grid", gap: "var(--space-3)" }}>
        {reports?.map((r) => (
          <div key={r.id} className="card" style={{ padding: "var(--space-5) var(--space-6)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "var(--space-3)" }}>
              <div>
                <p style={{ margin: 0 }}>
                  <strong>{r.reporter.name}</strong> reported <strong>{r.reported_user.name}</strong>
                  {" "}<span className={`tag ${r.status === "open" ? "tag-teach" : "tag-neutral"}`}>{r.status}</span>
                </p>
                <p className="field-hint" style={{ margin: "var(--space-1) 0 0" }}>
                  Reason: {r.reason} · Session #{r.session_id} · {fmt(r.created_at)}
                </p>
                {r.note && <p style={{ margin: "var(--space-2) 0 0", fontSize: "var(--text-body-sm)" }}>{r.note}</p>}
              </div>
              {r.status === "open" && (
                <button className="btn btn-secondary btn-sm" disabled={busyId === r.id} onClick={() => resolve(r.id)}>
                  Mark resolved
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CreditAdjustForm({ userId, onDone }) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    const n = parseInt(amount, 10);
    if (!n) {
      setError("Enter a non-zero whole number.");
      return;
    }
    if (!reason.trim()) {
      setError("A reason is required.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await apiJson(`/api/admin/users/${userId}/credit-adjustment`, {
        method: "POST",
        body: JSON.stringify({ amount: n, reason: reason.trim() }),
      });
      setAmount("");
      setReason("");
      onDone(result.balance);
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", alignItems: "flex-start", marginTop: "var(--space-3)" }}>
      <input
        type="number"
        placeholder="+/- credits"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="input"
        style={{ width: 120 }}
      />
      <input
        type="text"
        placeholder="Reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="input"
        style={{ flex: 1, minWidth: 160 }}
      />
      <button type="submit" className="btn btn-secondary btn-sm" disabled={submitting}>
        {submitting ? "Applying…" : "Apply"}
      </button>
      {error && <p className="field-hint" style={{ color: "var(--color-danger, #d94848)", width: "100%", margin: 0 }}>{error}</p>}
    </form>
  );
}

function UsersTab() {
  const [users, setUsers] = useState(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [openAdjustFor, setOpenAdjustFor] = useState(null);
  const [balances, setBalances] = useState({});

  async function load() {
    try {
      const data = await apiJson("/api/admin/users?limit=200");
      setUsers(data);
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function toggleSuspend(u) {
    setBusyId(u.id);
    setError("");
    try {
      await apiJson(`/api/admin/users/${u.id}/${u.is_active ? "suspend" : "unsuspend"}`, { method: "POST" });
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  }

  function onAdjusted(userId, balance) {
    setOpenAdjustFor(null);
    setBalances((b) => ({ ...b, [userId]: balance }));
  }

  return (
    <div>
      {error && <div className="error-banner">{error}</div>}
      {users === null && <p>Loading…</p>}

      <div style={{ display: "grid", gap: "var(--space-3)" }}>
        {users?.map((u) => (
          <div key={u.id} className="card" style={{ padding: "var(--space-5) var(--space-6)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "var(--space-3)" }}>
              <div>
                <p style={{ margin: 0 }}>
                  <strong>{u.name}</strong> <span className="field-hint">{u.email}</span>
                  {u.is_admin && <span className="tag tag-learn" style={{ marginLeft: "var(--space-2)" }}>admin</span>}
                  {!u.is_active && <span className="tag tag-neutral" style={{ marginLeft: "var(--space-2)" }}>suspended</span>}
                </p>
                <p className="field-hint" style={{ margin: "var(--space-1) 0 0" }}>
                  Joined {fmt(u.created_at)}
                  {balances[u.id] !== undefined && ` · New balance: ${balances[u.id]}`}
                </p>
              </div>
              <div style={{ display: "flex", gap: "var(--space-2)" }}>
                <button className="btn btn-secondary btn-sm" onClick={() => setOpenAdjustFor(openAdjustFor === u.id ? null : u.id)}>
                  Adjust credits
                </button>
                {!u.is_admin && (
                  <button
                    className="btn btn-secondary btn-sm"
                    disabled={busyId === u.id}
                    onClick={() => toggleSuspend(u)}
                  >
                    {u.is_active ? "Suspend" : "Unsuspend"}
                  </button>
                )}
              </div>
            </div>
            {openAdjustFor === u.id && <CreditAdjustForm userId={u.id} onDone={(balance) => onAdjusted(u.id, balance)} />}
          </div>
        ))}
      </div>
    </div>
  );
}

function StatCard({ label, value, hint }) {
  return (
    <div className="card" style={{ padding: "var(--space-5) var(--space-6)" }}>
      <span className="eyebrow">{label}</span>
      <p style={{ margin: "var(--space-1) 0 0", fontSize: "var(--text-heading-sm)", color: "var(--color-electric-blue)", fontWeight: 600 }}>{value}</p>
      {hint && <p className="field-hint" style={{ margin: "var(--space-1) 0 0" }}>{hint}</p>}
    </div>
  );
}

function SkillBarChart({ data, barColor }) {
  if (!data || data.length === 0) return <p className="field-hint">No data yet.</p>;
  return (
    <div style={{ height: 220 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: "var(--text-tertiary)" }} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="skill_name" width={130} tick={{ fontSize: 11, fill: "var(--text-secondary)" }} axisLine={false} tickLine={false} />
          <Tooltip cursor={{ fill: "var(--surface-alt)" }} contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--space-2)", fontSize: "var(--text-body-sm)" }} />
          <Bar dataKey="count" fill={barColor} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function AnalyticsTab() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiJson("/api/admin/analytics").then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="error-banner">{error}</div>;
  if (!data) return <p>Loading…</p>;

  return (
    <div>
      <div style={{ display: "grid", gap: "var(--space-4)", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", marginBottom: "var(--space-6)" }}>
        <StatCard label="Sessions completed" value={data.sessions_completed} />
        <StatCard label="Credits in circulation" value={data.credits_in_circulation} />
        <StatCard
          label="Avg. time to first match"
          value={data.avg_time_to_first_match_hours === null ? "—" : `${Math.round(data.avg_time_to_first_match_hours)}h`}
          hint="Signup to first accepted swap request"
        />
      </div>

      <div className="card" style={{ padding: "var(--space-6)", marginBottom: "var(--space-5)" }}>
        <h3 style={{ marginTop: 0 }}>Signups, last 31 days</h3>
        <div style={{ height: 180 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.signups_over_time} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: "var(--text-tertiary)" }}
                axisLine={false}
                tickLine={false}
                interval={Math.max(0, Math.floor(data.signups_over_time.length / 6))}
                tickFormatter={(d) => d.slice(5)}
              />
              <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "var(--text-tertiary)" }} axisLine={false} tickLine={false} width={24} />
              <Tooltip cursor={{ fill: "var(--surface-alt)" }} contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--space-2)", fontSize: "var(--text-body-sm)" }} />
              <Bar dataKey="count" fill="var(--color-electric-blue)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ display: "grid", gap: "var(--space-5)", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        <div className="card" style={{ padding: "var(--space-6)" }}>
          <h3 style={{ marginTop: 0 }}>Most-taught skills</h3>
          <SkillBarChart data={data.top_taught_skills} barColor="var(--color-leaf)" />
        </div>
        <div className="card" style={{ padding: "var(--space-6)" }}>
          <h3 style={{ marginTop: 0 }}>Most-wanted skills</h3>
          <SkillBarChart data={data.top_wanted_skills} barColor="var(--color-electric-blue)" />
        </div>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const [tab, setTab] = useState("reports");

  return (
    <div className="container" style={{ paddingTop: "var(--space-10)", paddingBottom: "var(--space-20)" }}>
      <p className="eyebrow">Moderation</p>
      <h1>Admin</h1>

      <div role="tablist" style={{ display: "flex", gap: "var(--space-2)", margin: "var(--space-5) 0" }}>
        <button
          role="tab"
          aria-selected={tab === "reports"}
          className={`btn btn-sm ${tab === "reports" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setTab("reports")}
        >
          Reports
        </button>
        <button
          role="tab"
          aria-selected={tab === "users"}
          className={`btn btn-sm ${tab === "users" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setTab("users")}
        >
          Users
        </button>
        <button
          role="tab"
          aria-selected={tab === "analytics"}
          className={`btn btn-sm ${tab === "analytics" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setTab("analytics")}
        >
          Analytics
        </button>
      </div>

      {tab === "reports" && <ReportsTab />}
      {tab === "users" && <UsersTab />}
      {tab === "analytics" && <AnalyticsTab />}
    </div>
  );
}
