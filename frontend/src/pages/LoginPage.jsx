import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { apiJson, API_BASE } from "../api/client";
import { useAuth } from "../context/AuthContext";
import MatchClusterIllustration from "../components/MatchClusterIllustration";
import PasswordInput from "../components/PasswordInput";

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { applyTokens } = useAuth();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("oauth_error") === "google_state_mismatch") {
      setError("Google sign-in was interrupted. Please try again.");
    } else if (params.get("oauth_error") === "account_suspended") {
      setError("This account has been suspended.");
    }
  }, [location.search]);

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await apiJson("/api/auth/login", { method: "POST", body: JSON.stringify(form) });
      if (res.requires_2fa) {
        navigate("/2fa", { state: { userId: res.challenge_user_id } });
        return;
      }
      await applyTokens(res.access_token, res.refresh_token);
      navigate("/home");
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="container auth-split" style={{ paddingTop: "var(--space-8)", paddingBottom: "var(--space-16)" }}>
      <div style={{ maxWidth: 440, width: "100%" }}>
        <Link
          to="/"
          aria-label="Back to home"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 36,
            height: 36,
            borderRadius: "999px",
            border: "1px solid var(--border)",
            color: "var(--text-heading)",
            marginBottom: "var(--space-8)",
          }}
        >
          <ArrowLeft size={18} />
        </Link>

        <p className="eyebrow">Welcome back</p>
        <h1 style={{ fontSize: "var(--text-heading)" }}>Log in</h1>

        {error && <div className="error-banner">{error}</div>}

        <form onSubmit={onSubmit} className="card" style={{ padding: "var(--space-8)" }}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <PasswordInput id="password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
          <button className="btn btn-primary btn-block" disabled={submitting}>
            {submitting ? "Logging in…" : "Log in"}
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", margin: "var(--space-5) 0" }}>
            <hr style={{ flex: 1, border: "none", borderTop: "1px solid var(--border)" }} />
            <span style={{ color: "var(--text-tertiary)", fontSize: "var(--text-body-sm)" }}>or</span>
            <hr style={{ flex: 1, border: "none", borderTop: "1px solid var(--border)" }} />
          </div>

          <a href={`${API_BASE}/api/auth/google/login`} className="btn btn-secondary btn-block">
            Continue with Google
          </a>
        </form>

        <p style={{ marginTop: "var(--space-5)", textAlign: "center", display: "flex", justifyContent: "space-between" }}>
          <Link to="/forgot-password">Forgot password?</Link>
          <Link to="/signup">Create an account</Link>
        </p>
      </div>

      <div className="auth-illustration">
        <MatchClusterIllustration />
      </div>
    </div>
  );
}
