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

export { DAY_NAMES };
