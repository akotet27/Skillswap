import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { apiJson } from "../api/client";

/** Lives in Settings, not Profile -- account security, not public
 * identity. Renders an actual scannable QR code from the otpauth:// URI
 * the backend returns (via the `qrcode.react` package) -- previously
 * this only showed the raw secret as text while the copy told the user
 * to "scan" something that was never rendered. The secret is still shown
 * below the code for manual entry, since not every authenticator app
 * handles camera scanning equally well. */
export default function TwoFactorCard({ user, onChanged }) {
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function startSetup() {
    setError("");
    setSetup(await apiJson("/api/auth/2fa/setup", { method: "POST" }));
  }

  async function enable(e) {
    e.preventDefault();
    setError("");
    try {
      await apiJson("/api/auth/2fa/enable", { method: "POST", body: JSON.stringify({ code }) });
      setSetup(null);
      setCode("");
      await onChanged();
    } catch (err) {
      setError(err.message);
    }
  }

  async function disable(e) {
    e.preventDefault();
    setError("");
    try {
      await apiJson("/api/auth/2fa/disable", { method: "POST", body: JSON.stringify({ password }) });
      setPassword("");
      await onChanged();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section className="card" style={{ padding: "var(--space-8)" }}>
      <h3>Two-factor authentication</h3>
      {error && <div className="error-banner">{error}</div>}

      {user.totp_enabled ? (
        <form onSubmit={disable}>
          <p>2FA is currently <strong>enabled</strong> on your account.</p>
          <div className="field">
            <label htmlFor="pw">Confirm your password to disable</label>
            <input id="pw" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <button className="btn btn-secondary">Disable 2FA</button>
        </form>
      ) : setup ? (
        <form onSubmit={enable}>
          <p>Scan this code with your authenticator app (Google Authenticator, Authy, 1Password, etc.):</p>
          <div style={{ background: "#fff", padding: "var(--space-4)", borderRadius: "var(--space-3)", display: "inline-block", marginBottom: "var(--space-4)" }}>
            <QRCodeSVG value={setup.otpauth_uri} size={180} />
          </div>
          <p className="field-hint">Can't scan? Enter this code manually instead:</p>
          <p style={{ fontFamily: "monospace", background: "var(--surface-alt)", padding: "var(--space-3)", borderRadius: "var(--space-2)", wordBreak: "break-all" }}>
            {setup.secret}
          </p>
          <div className="field">
            <label htmlFor="totp">6-digit code from the app</label>
            <input id="totp" required inputMode="numeric" autoFocus value={code} onChange={(e) => setCode(e.target.value)} />
          </div>
          <button className="btn btn-primary">Confirm & enable</button>
        </form>
      ) : (
        <>
          <p>Add an extra layer of security using an authenticator app like Google Authenticator or Authy.</p>
          <button className="btn btn-secondary" onClick={startSetup} type="button">Set up 2FA</button>
        </>
      )}
    </section>
  );
}
