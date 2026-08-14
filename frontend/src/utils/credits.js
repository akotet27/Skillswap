/** Credit amounts can be fractional now (duration-based partial credit --
 * see backend/app/services/credits.py:compute_earned_amount), so every
 * display of a balance/amount needs to round for display and trim a
 * trailing ".00"/".50" rather than showing raw float noise. Whole numbers
 * (signup bonus, admin adjustments, spends) still print exactly as before. */
export function formatCredits(n) {
  const rounded = Math.round((n + Number.EPSILON) * 100) / 100;
  return rounded % 1 === 0 ? String(rounded) : rounded.toFixed(2).replace(/0$/, "");
}

export function pluralizeCredits(n) {
  return `${formatCredits(n)} credit${Math.abs(n) === 1 ? "" : "s"}`;
}
