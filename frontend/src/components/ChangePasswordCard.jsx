import { useState } from "react";
import { apiJson } from "../api/client";
import { checkPasswordStrength } from "../utils/passwordStrength";
import PasswordStrengthHint from "./PasswordStrengthHint";
import PasswordInput from "./PasswordInput";

/** Lives in Settings alongside 2FA -- account security, not identity.
 * Google-only accounts (no local password) aren't distinguishable from
 * `UserOut` alone, so we just let the backend's 400 ("signs in with
 * Google and has no password to change") surface as the error banner
 * rather than guessing client-side. */
export default function ChangePasswordCard() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const strength = checkPasswordStrength(next);
  const mismatch = confirm.length > 0 && next !== confirm;

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess(false);
    if (!strength.isStrong) {
      setError("Choose a stronger new password.");
      return;
    }
    if (next !== confirm) {
      setError("Those passwords don't match.");
      return;
    }
    setSubmitting(true);
    try {
      await apiJson("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ current_password: current, new_password: next }),
      });
      setCurrent("");
      setNext("");
      setConfirm("");
      setSuccess(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="card" style={{ padding: "var(--space-8)" }}>
      <h3>Change password</h3>
      {error && <div className="error-banner">{error}</div>}
      {success && (
        <div className="card" style={{ padding: "var(--space-3) var(--space-4)", marginBottom: "var(--space-5)", borderColor: "var(--color-leaf)", color: "var(--color-leaf)", fontSize: "var(--text-body-sm)" }}>
          Password updated. We've sent a confirmation to your email. You'll stay signed in here; other devices
          have been signed out.
        </div>
      )}
      <form onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="current-pw">Current password</label>
          <PasswordInput id="current-pw" required autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="new-pw">New password</label>
          <PasswordInput id="new-pw" required autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
          <PasswordStrengthHint password={next} />
        </div>
        <div className="field">
          <label htmlFor="confirm-pw">Confirm new password</label>
          <PasswordInput id="confirm-pw" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          {mismatch && <span className="field-error">Passwords don't match.</span>}
        </div>
        <button className="btn btn-primary" disabled={submitting || !strength.isStrong || mismatch || !confirm}>
          {submitting ? "Updating…" : "Update password"}
        </button>
      </form>
    </section>
  );
}
