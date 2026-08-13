import { useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { apiJson } from "../api/client";
import PasswordStrengthHint from "../components/PasswordStrengthHint";
import { checkPasswordStrength } from "../utils/passwordStrength";

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const passwordStrong = checkPasswordStrength(password).isStrong;
  // Only flag a mismatch once they've actually typed something in the
  // confirm field -- an empty confirm box isn't a "mismatch" yet, just
  // unfinished.
  const mismatch = confirm.length > 0 && password !== confirm;

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    if (!passwordStrong) {
      setError("Please choose a stronger password.");
      return;
    }
    if (password !== confirm) {
      setError("Those passwords don't match.");
      return;
    }
    setSubmitting(true);
    try {
      await apiJson("/api/auth/password-reset/confirm", {
        method: "POST",
        body: JSON.stringify({ token, new_password: password }),
      });
      setDone(true);
      setTimeout(() => navigate("/login"), 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <div className="container" style={{ maxWidth: 440, paddingTop: "var(--space-16)" }}>
        <div className="error-banner">Missing reset token. Use the link from your email.</div>
        <Link to="/forgot-password">Request a new link</Link>
      </div>
    );
  }

  return (
    <div className="container" style={{ maxWidth: 440, paddingTop: "var(--space-16)" }}>
      <p className="eyebrow">Reset password</p>
      <h1 style={{ fontSize: "var(--text-heading)" }}>Choose a new password</h1>

      {error && <div className="error-banner">{error}</div>}

      {done ? (
        <div className="card" style={{ padding: "var(--space-8)" }}>
          <p>
            Password updated. We've sent a confirmation to your email and signed you out everywhere else.
            Redirecting to log in…
          </p>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="card" style={{ padding: "var(--space-8)" }}>
          <div className="field">
            <label htmlFor="password">New password</label>
            <input
              id="password"
              type="password"
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <PasswordStrengthHint password={password} />
          </div>
          <div className="field">
            <label htmlFor="confirm">Confirm new password</label>
            <input
              id="confirm"
              type="password"
              required
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
            {mismatch && <span className="field-error">Passwords don't match.</span>}
          </div>
          <button className="btn btn-primary btn-block" disabled={submitting || !passwordStrong || mismatch || !confirm}>
            {submitting ? "Updating…" : "Update password"}
          </button>
        </form>
      )}
    </div>
  );
}
