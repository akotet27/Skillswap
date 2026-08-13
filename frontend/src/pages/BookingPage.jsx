import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiJson } from "../api/client";
import { DAY_NAMES, nextDateForDayOfWeek, zonedTimeToUtc } from "../utils/timezone";

export default function BookingPage() {
  const { userId } = useParams();
  const navigate = useNavigate();

  const [target, setTarget] = useState(null);
  const [targetSkills, setTargetSkills] = useState(null);
  const [availability, setAvailability] = useState(null);
  const [mySkills, setMySkills] = useState(null);
  const [error, setError] = useState("");

  const [selectedBlockIdx, setSelectedBlockIdx] = useState(null);
  const [weeksAhead, setWeeksAhead] = useState(0);
  const [skillLearnedId, setSkillLearnedId] = useState("");
  const [skillTaughtId, setSkillTaughtId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    Promise.all([
      apiJson(`/api/users/${userId}`),
      apiJson(`/api/users/${userId}/skills`),
      apiJson(`/api/users/${userId}/availability`),
      apiJson("/api/users/me/skills"),
    ])
      .then(([t, ts, av, ms]) => {
        setTarget(t);
        setTargetSkills(ts);
        setAvailability(av);
        setMySkills(ms);
      })
      .catch((e) => setError(e.message));
  }, [userId]);

  if (error) return <div className="container" style={{ paddingTop: "var(--space-16)" }}><div className="error-banner">{error}</div></div>;
  if (!target || !targetSkills || !availability || !mySkills) {
    return <div className="container" style={{ paddingTop: "var(--space-16)" }}>Loading…</div>;
  }

  const myWantIds = new Set(mySkills.filter((s) => s.type === "want").map((s) => s.skill.id));
  const myHaveIds = new Set(mySkills.filter((s) => s.type === "have").map((s) => s.skill.id));
  const theirWantIds = new Set(targetSkills.filter((s) => s.type === "want").map((s) => s.skill.id));

  // What they could teach ME in this session (their "have" tags I "want").
  const learnableOptions = targetSkills.filter((s) => s.type === "have" && myWantIds.has(s.skill.id));
  // What I could offer them in return (my "have" tags they "want").
  const teachableOptions = mySkills.filter((s) => s.type === "have" && theirWantIds.has(s.skill.id));

  async function submit(e) {
    e.preventDefault();
    setError("");
    const block = availability[selectedBlockIdx];
    const dateStr = nextDateForDayOfWeek(block.day_of_week, weeksAhead);
    const start = zonedTimeToUtc(dateStr, block.start_time.slice(0, 5), block.timezone);
    const end = zonedTimeToUtc(dateStr, block.end_time.slice(0, 5), block.timezone);

    setSubmitting(true);
    try {
      await apiJson("/api/swap-requests", {
        method: "POST",
        body: JSON.stringify({
          recipient_id: Number(userId),
          skill_taught_id: Number(skillTaughtId),
          skill_learned_id: Number(skillLearnedId),
          proposed_start_utc: start.toISOString(),
          proposed_end_utc: end.toISOString(),
        }),
      });
      setSuccess(true);
      setTimeout(() => navigate("/requests"), 1200);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="container" style={{ maxWidth: 640, paddingTop: "var(--space-10)", paddingBottom: "var(--space-20)" }}>
      <p className="eyebrow">Book a session</p>
      <h1>Learn from {target.name}</h1>

      {success ? (
        <div className="card" style={{ padding: "var(--space-8)" }}>
          <p>Request sent! Redirecting to your requests…</p>
        </div>
      ) : learnableOptions.length === 0 || teachableOptions.length === 0 ? (
        <div className="card" style={{ padding: "var(--space-8)" }}>
          <p>
            You and {target.name} don't have a mutual skill overlap right now — double-check your "have"/"want" tags
            on your profile.
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="card" style={{ padding: "var(--space-8)" }}>
          <div className="field">
            <label htmlFor="learned">What you'll learn from {target.name}</label>
            <select id="learned" required value={skillLearnedId} onChange={(e) => setSkillLearnedId(e.target.value)}>
              <option value="">Choose a skill…</option>
              {learnableOptions.map((s) => (
                <option key={s.skill.id} value={s.skill.id}>{s.skill.name}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="taught">What you'll offer in return (a future session)</label>
            <select id="taught" required value={skillTaughtId} onChange={(e) => setSkillTaughtId(e.target.value)}>
              <option value="">Choose a skill…</option>
              {teachableOptions.map((s) => (
                <option key={s.skill.id} value={s.skill.id}>{s.skill.name}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="block">{target.name}'s available time blocks</label>
            <select id="block" required value={selectedBlockIdx ?? ""} onChange={(e) => setSelectedBlockIdx(e.target.value)}>
              <option value="">Choose a time…</option>
              {availability.map((b, i) => (
                <option key={i} value={i}>
                  {DAY_NAMES[b.day_of_week]} {b.start_time.slice(0, 5)}–{b.end_time.slice(0, 5)} ({b.timezone})
                </option>
              ))}
            </select>
            {availability.length === 0 && <span className="field-hint">{target.name} hasn't set any availability yet.</span>}
          </div>

          <div className="field">
            <label htmlFor="weeks">Which occurrence</label>
            <select id="weeks" value={weeksAhead} onChange={(e) => setWeeksAhead(Number(e.target.value))}>
              <option value={0}>This coming week</option>
              <option value={1}>The week after</option>
              <option value={2}>In two weeks</option>
            </select>
          </div>

          {error && <div className="error-banner">{error}</div>}

          <button className="btn btn-primary btn-block" disabled={submitting || selectedBlockIdx === null}>
            {submitting ? "Sending request…" : "Send swap request"}
          </button>
        </form>
      )}
    </div>
  );
}
