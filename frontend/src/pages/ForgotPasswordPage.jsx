import { useState } from "react";
import { Link } from "react-router-dom";
import { apiJson } from "../api/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await apiJson("/api/auth/password-reset/request", { method: "POST", body: JSON.stringify({ email }) });
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="container" style={{ maxWidth: 440, paddingTop: "var(--space-16)" }}>
      <p className="eyebrow">Reset password</p>
      <h1 style={{ fontSize: "var(--text-heading)" }}>Forgot your password?</h1>

      {sent ? (
        <div className="card" style={{ padding: "var(--space-8)" }}>
          <p>If that email is registered, a reset link is on its way — check your inbox (and spam folder).</p>
          <Link to="/login" className="btn btn-secondary btn-block">Back to log in</Link>
        </div>
      ) : (
        <>
          {error && <div className="error-banner">{error}</div>}
          <form onSubmit={onSubmit} className="card" style={{ padding: "var(--space-8)" }}>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <button className="btn btn-primary btn-block" disabled={submitting}>
              {submitting ? "Sending…" : "Send reset link"}
            </button>
          </form>
        </>
      )}
    </div>
  );
}
