import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiJson } from "../api/client";
import PasswordStrengthHint from "../components/PasswordStrengthHint";
import { checkPasswordStrength } from "../utils/passwordStrength";
import MatchClusterIllustration from "../components/MatchClusterIllustration";

export default function SignupPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "", timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const passwordStrong = checkPasswordStrength(form.password).isStrong;

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    if (!passwordStrong) {
      setError("Please choose a stronger password.");
      return;
    }
    setSubmitting(true);
    try {
      await apiJson("/api/auth/signup", { method: "POST", body: JSON.stringify(form) });
      navigate("/verify-otp", { state: { email: form.email } });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="container auth-split" style={{ paddingTop: "var(--space-16)", paddingBottom: "var(--space-16)" }}>
      <div style={{ maxWidth: 440, width: "100%" }}>
        <p className="eyebrow">Get started</p>
        <h1 style={{ fontSize: "var(--text-heading)" }}>Create your account</h1>
        <p>Teach what you know, learn what you don't — no cash changes hands.</p>

        {error && <div className="error-banner">{error}</div>}

        <form onSubmit={onSubmit} className="card" style={{ padding: "var(--space-8)" }}>
          <div className="field">
            <label htmlFor="name">Full name</label>
            <input id="name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              required
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
            <PasswordStrengthHint password={form.password} />
          </div>
          <button className="btn btn-primary btn-block" disabled={submitting || !passwordStrong}>
            {submitting ? "Creating account…" : "Sign up"}
          </button>
        </form>

        <p style={{ marginTop: "var(--space-5)", textAlign: "center" }}>
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </div>

      <div className="auth-illustration">
        <MatchClusterIllustration />
      </div>
    </div>
  );
}
