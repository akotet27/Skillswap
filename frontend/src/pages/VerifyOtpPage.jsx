import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Clock } from "lucide-react";
import { apiJson } from "../api/client";
import { useAuth } from "../context/AuthContext";

const RESEND_COOLDOWN_SECONDS = 30;
// Mirrors the backend's OTP_EXPIRE_MINUTES (app/core/config.py) -- purely
// a UI countdown, not enforcement. The backend is the actual source of
// truth for whether a code is still valid; this just tells the user
// what to expect instead of letting the code silently go stale.
const CODE_EXPIRY_SECONDS = 5 * 60;

function formatClock(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function VerifyOtpPage() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const { applyTokens } = useAuth();
  const [code, setCode] = useState(state?.verificationCode || "");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [expiresIn, setExpiresIn] = useState(CODE_EXPIRY_SECONDS);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  useEffect(() => {
    if (expiresIn <= 0) return;
    const timer = setInterval(() => setExpiresIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [expiresIn]);

  if (!state?.email) {
    navigate("/signup", { replace: true });
    return null;
  }

  const expired = expiresIn <= 0;

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await apiJson("/api/auth/verify-otp", {
        method: "POST",
        body: JSON.stringify({ email: state.email, code: code.trim() }),
      });
      await applyTokens(res.access_token, res.refresh_token);
      navigate("/onboarding");
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function onResend() {
    setError("");
    setResending(true);
    try {
      const res = await apiJson("/api/auth/resend-otp", { method: "POST", body: JSON.stringify({ email: state.email }) });
      setResent(true);
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setExpiresIn(CODE_EXPIRY_SECONDS);
      if (res.verification_code) {
        setCode(res.verification_code);
      } else {
        setCode("");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="container" style={{ maxWidth: 440, paddingTop: "var(--space-16)" }}>
      <p className="eyebrow">Almost there</p>
      <h1 style={{ fontSize: "var(--text-heading)" }}>Verify your email</h1>
      <p>
        To finish creating your account, enter the 6-character verification code we sent to{" "}
        <strong>{state.email}</strong>.
      </p>

      {state?.verificationCode && (
        <div className="card" style={{ padding: "var(--space-3) var(--space-4)", marginBottom: "var(--space-5)", borderColor: "var(--color-leaf)", color: "var(--color-leaf)", fontSize: "var(--text-body-sm)" }}>
          Development mode is using the local OTP fallback. Your code is already filled in below.
        </div>
      )}

      <p
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "var(--space-2)",
          fontSize: "var(--text-body-sm)",
          fontWeight: 600,
          color: expired ? "var(--color-coral)" : "var(--text-secondary)",
          marginTop: "calc(var(--space-4) * -1)",
        }}
      >
        <Clock size={14} />
        {expired ? "Code expired" : <>Expires in {formatClock(expiresIn)}</>}
      </p>

      {error && <div className="error-banner">{error}</div>}
      {resent && !error && (
        <div className="card" style={{ padding: "var(--space-3) var(--space-4)", marginBottom: "var(--space-5)", borderColor: "var(--color-leaf)", color: "var(--color-leaf)", fontSize: "var(--text-body-sm)" }}>
          A new code is on its way. It can take a minute to arrive.
        </div>
      )}
      {expired && !resent && (
        <div className="error-banner">This code has expired. Request a new one below.</div>
      )}

      <form onSubmit={onSubmit} className="card" style={{ padding: "var(--space-8)" }}>
        <div className="field">
          <label htmlFor="code">Verification code</label>
          <input
            id="code"
            required
            autoFocus
            disabled={expired}
            style={{ textTransform: "uppercase", letterSpacing: "0.2em", fontWeight: 600 }}
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </div>
        <button className="btn btn-primary btn-block" disabled={submitting || expired}>
          {submitting ? "Verifying…" : "Verify"}
        </button>
      </form>

      <p style={{ marginTop: "var(--space-5)", textAlign: "center" }}>
        Didn't get a code?{" "}
        {cooldown > 0 ? (
          <span className="field-hint">Resend available in {cooldown}s</span>
        ) : (
          <button
            type="button"
            onClick={onResend}
            disabled={resending}
            style={{ background: "none", border: "none", padding: 0, color: "var(--color-electric-blue)", cursor: "pointer", font: "inherit", textDecoration: "underline" }}
          >
            {resending ? "Sending…" : "Resend code"}
          </button>
        )}
      </p>
    </div>
  );
}
