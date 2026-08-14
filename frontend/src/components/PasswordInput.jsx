import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

/** A password <input> with a show/hide eye-icon toggle -- one component
 * used everywhere a password field appears (login, signup, reset,
 * change-password, the 2FA-disable confirm field) rather than
 * copy-pasted per form. Forwards every prop straight to the underlying
 * input except `className`, which always gets "input" appended so it
 * keeps the standard field styling regardless of what the caller passes. */
export default function PasswordInput({ id, className = "", ...props }) {
  const [visible, setVisible] = useState(false);

  return (
    <div style={{ position: "relative" }}>
      <input
        id={id}
        type={visible ? "text" : "password"}
        className={`input ${className}`.trim()}
        style={{ paddingRight: "var(--space-9)" }}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-controls={id}
        tabIndex={-1}
        style={{
          position: "absolute",
          top: "50%",
          right: "var(--space-3)",
          transform: "translateY(-50%)",
          background: "none",
          border: "none",
          padding: "var(--space-1)",
          cursor: "pointer",
          color: "var(--text-tertiary)",
          display: "flex",
        }}
      >
        {visible ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
    </div>
  );
}
