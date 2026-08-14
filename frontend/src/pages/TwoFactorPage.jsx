import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { apiJson } from "../api/client";
import { useAuth } from "../context/AuthContext";

export default function TwoFactorPage() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const { applyTokens } = useAuth();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!state?.userId) {
    navigate("/login", { replace: true });
    return null;
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await apiJson("/api/auth/2fa/verify", {
        method: "POST",
        body: JSON.stringify({ user_id: state.userId, code: code.trim() }),
      });
      await applyTokens(res.access_token, res.refresh_token);
      navigate("/home");
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="container" style={{ maxWidth: 440, paddingTop: "var(--space-16)" }}>
      <p className="eyebrow">Two-factor authentication</p>
      <h1 style={{ fontSize: "var(--text-heading)" }}>Enter your code</h1>
      <p>Open your authenticator app and enter the 6-digit code for SkillSwap.</p>

      {error && <div className="error-banner">{error}</div>}

      <form onSubmit={onSubmit} className="card" style={{ padding: "var(--space-8)" }}>
        <div className="field">
          <label htmlFor="code">Authenticator code</label>
          <input
            id="code"
            required
            autoFocus
            inputMode="numeric"
            style={{ letterSpacing: "0.3em", fontWeight: 600 }}
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </div>
        <button className="btn btn-primary btn-block" disabled={submitting}>
          {submitting ? "Verifying…" : "Verify"}
        </button>
      </form>
    </div>
  );
}
