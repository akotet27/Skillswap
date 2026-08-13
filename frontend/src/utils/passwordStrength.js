/**
 * Mirrors the backend's rule exactly (app/schemas/auth.py
 * `_validate_password_strength`): at least 8 characters, plus all 4 of
 * the character classes below (Google-style strength bar, not the looser
 * 3-of-4 this used to require). This is client-side *feedback* only --
 * the backend re-checks and is the actual enforcement, since a client
 * check alone is trivially bypassed.
 */
const CLASSES = [
  { key: "lower", label: "a lowercase letter", test: (v) => /[a-z]/.test(v) },
  { key: "upper", label: "an uppercase letter", test: (v) => /[A-Z]/.test(v) },
  { key: "digit", label: "a number", test: (v) => /[0-9]/.test(v) },
  { key: "symbol", label: "a symbol", test: (v) => /[^a-zA-Z0-9]/.test(v) },
];

export function checkPasswordStrength(password) {
  const lengthOk = password.length >= 8;
  const classResults = CLASSES.map((c) => ({ ...c, met: c.test(password) }));
  const classesMet = classResults.filter((c) => c.met).length;
  return {
    lengthOk,
    classResults,
    classesMet,
    isStrong: lengthOk && classesMet === CLASSES.length,
  };
}
