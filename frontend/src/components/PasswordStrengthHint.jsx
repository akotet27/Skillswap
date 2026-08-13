import { checkPasswordStrength } from "../utils/passwordStrength";

/** A single hint/error line under a password field -- plain grey
 * instructions by default, one concise red line once the password is
 * long enough to judge but still missing variety. Deliberately not a
 * multi-line checklist (tried that, it was too busy for a login form). */
export default function PasswordStrengthHint({ password }) {
  if (!password) {
    return <span className="field-hint">At least 8 characters, with a mix of uppercase, lowercase, numbers, and symbols.</span>;
  }

  const { lengthOk, classesMet } = checkPasswordStrength(password);
  const REQUIRED = 4;

  if (!lengthOk) {
    return <span className="field-hint">At least 8 characters, with a mix of uppercase, lowercase, numbers, and symbols.</span>;
  }
  if (classesMet < REQUIRED) {
    return <span className="field-error">Add {REQUIRED - classesMet} more type{REQUIRED - classesMet === 1 ? "" : "s"} of character (uppercase, lowercase, numbers, symbols).</span>;
  }
  return <span className="field-hint" style={{ color: "var(--color-leaf)" }}>Strong password.</span>;
}
