/**
 * Convert a wall-clock date+time in a given IANA timezone to a UTC Date.
 * No date library is in the dependency list (kept minimal per the spec),
 * so this uses the standard "round-trip through toLocaleString" trick:
 * format the same instant in both the target zone and UTC, and use the
 * difference as the zone's offset at that instant (correctly handling
 * DST, unlike a fixed offset table). Good enough for picking a session
 * slot; not used for anything safety-critical.
 */
export function zonedTimeToUtc(dateStr, timeStr, timeZone) {
  const naiveUtcGuess = new Date(`${dateStr}T${timeStr}:00Z`);
  const asIfInZone = new Date(naiveUtcGuess.toLocaleString("en-US", { timeZone }));
  const asIfInUtc = new Date(naiveUtcGuess.toLocaleString("en-US", { timeZone: "UTC" }));
  const offsetMs = asIfInUtc.getTime() - asIfInZone.getTime();
  return new Date(naiveUtcGuess.getTime() + offsetMs);
}

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** Next date (YYYY-MM-DD, in the *local browser* calendar) matching the
 * given ISO day-of-week (0=Monday..6=Sunday), `weeksAhead` weeks from now. */
export function nextDateForDayOfWeek(dayOfWeek, weeksAhead = 0) {
  const today = new Date();
  const todayIso = (today.getDay() + 6) % 7; // JS getDay(): 0=Sunday -> convert to 0=Monday
  let delta = (dayOfWeek - todayIso + 7) % 7;
  if (delta === 0 && weeksAhead === 0) delta = 0; // allow booking later today
  const target = new Date(today);
  target.setDate(today.getDate() + delta + weeksAhead * 7);
  return target.toISOString().slice(0, 10);
}

export { DAY_NAMES };
