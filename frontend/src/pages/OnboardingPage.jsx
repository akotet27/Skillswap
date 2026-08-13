import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import { apiJson, apiFetch } from "../api/client";
import { useAuth } from "../context/AuthContext";
import SkillAutocompleteInput from "../components/SkillAutocompleteInput";

/** Shown once, right after email verification -- collects the two things
 * matching actually needs (age for eligibility/trust, skills for the
 * matching engine) while the user is still in the signup mindset, instead
 * of dropping them on an empty profile page. Age is optional-ish here
 * (skippable) since the backend already allows a null age; skills aren't
 * required either -- someone can always add them later from /profile.
 *
 * Every add/remove hits the API immediately (same as ProfilePage's
 * SkillsCard), rather than batching everything into local state until a
 * final "Finish" submit. The earlier batched version silently lost
 * anything you'd typed but not explicitly clicked "Add" for, or anything
 * you'd added if you navigated away (e.g. via the nav menu) before
 * clicking Finish -- it only ever existed in memory until then. */
export default function OnboardingPage() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [age, setAge] = useState("");
  const [savingAge, setSavingAge] = useState(false);
  const [teach, setTeach] = useState([]);
  const [learn, setLearn] = useState([]);
  const [draftTeach, setDraftTeach] = useState("");
  const [draftLearn, setDraftLearn] = useState("");
  const [error, setError] = useState("");
  const [ageError, setAgeError] = useState("");

  if (!user) {
    navigate("/login", { replace: true });
    return null;
  }

  async function addSkill(list, setList, value, setDraft, type) {
    const v = value.trim();
    if (!v) return;
    if (list.some((s) => s.name.toLowerCase() === v.toLowerCase())) {
      setDraft("");
      return;
    }
    setDraft("");
    setError("");
    try {
      const saved = await apiJson("/api/users/me/skills", {
        method: "POST",
        body: JSON.stringify({ skill_name: v, category: "General", type }),
      });
      setList((prev) => [...prev, { id: saved.id, name: saved.skill.name }]);
    } catch (err) {
      setError(err.message);
    }
  }

  async function removeSkill(list, setList, id) {
    setList(list.filter((s) => s.id !== id));
    await apiFetch(`/api/users/me/skills/${id}`, { method: "DELETE" });
  }

  async function onContinue() {
    if (!age.trim()) {
      setStep(2);
      return;
    }
    if (Number(age) < 18) {
      setAgeError("You must be 18 or older to use SkillSwap.");
      return;
    }
    setAgeError("");
    setSavingAge(true);
    try {
      await apiJson("/api/users/me", { method: "PATCH", body: JSON.stringify({ age: Number(age) }) });
      await refreshUser();
      setStep(2);
    } catch (err) {
      setAgeError(err.message);
    } finally {
      setSavingAge(false);
    }
  }

  // Guards against the "typed a skill but never clicked Add" case --
  // whatever's still sitting in the input gets saved before moving on,
  // instead of silently vanishing.
  async function finish() {
    if (draftTeach.trim()) await addSkill(teach, setTeach, draftTeach, setDraftTeach, "have");
    if (draftLearn.trim()) await addSkill(learn, setLearn, draftLearn, setDraftLearn, "want");
    navigate("/browse");
  }

  return (
    <div className="container" style={{ maxWidth: 520, paddingTop: "var(--space-16)", paddingBottom: "var(--space-20)" }}>
      <p className="eyebrow">Step {step} of 2</p>
      <h1 style={{ fontSize: "var(--text-heading)" }}>
        {step === 1 ? `Welcome, ${user.name.split(" ")[0]}` : "What are you into?"}
      </h1>

      {error && <div className="error-banner">{error}</div>}

      {step === 1 ? (
        <div className="card" style={{ padding: "var(--space-8)" }}>
          <p>A couple of quick things to help us match you with the right people.</p>
          <div className="field">
            <label htmlFor="age">Your age</label>
            <input
              id="age"
              type="number"
              min={18}
              max={130}
              placeholder="e.g. 27"
              value={age}
              onChange={(e) => {
                setAge(e.target.value);
                if (ageError) setAgeError("");
              }}
            />
            {ageError ? (
              <span className="field-error">{ageError}</span>
            ) : (
              <span className="field-hint">Optional, but SkillSwap is 18+. Helps us keep sessions age-appropriate.</span>
            )}
          </div>
          <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-6)" }}>
            <button type="button" className="btn btn-secondary" onClick={() => setStep(2)}>Skip</button>
            <button type="button" className="btn btn-primary" onClick={onContinue} disabled={savingAge}>
              {savingAge ? "Saving…" : "Continue"}
            </button>
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: "var(--space-8)" }}>
          <p>
            Add as many as you like -- pick a suggestion or type your own and press Add (or Enter). Each one is
            saved right away, and you can always change these later in your profile.
          </p>

          <div style={{ marginBottom: "var(--space-6)" }}>
            <p className="eyebrow" style={{ marginBottom: "var(--space-2)" }}>Skills I can teach</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                addSkill(teach, setTeach, draftTeach, setDraftTeach, "have");
              }}
              style={{ display: "flex", gap: "var(--space-3)", marginBottom: "var(--space-3)" }}
            >
              <SkillAutocompleteInput
                placeholder="e.g. Guitar, Excel, French…"
                value={draftTeach}
                onChange={setDraftTeach}
                onSelect={(name) => addSkill(teach, setTeach, name, setDraftTeach, "have")}
              />
              <button type="submit" className="btn btn-secondary btn-sm">Add</button>
            </form>
            <TagRow items={teach} tagClass="tag-teach" onRemove={(id) => removeSkill(teach, setTeach, id)} empty="None yet -- add as many as you teach." />
          </div>

          <div>
            <p className="eyebrow" style={{ marginBottom: "var(--space-2)" }}>Skills I want to learn</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                addSkill(learn, setLearn, draftLearn, setDraftLearn, "want");
              }}
              style={{ display: "flex", gap: "var(--space-3)", marginBottom: "var(--space-3)" }}
            >
              <SkillAutocompleteInput
                placeholder="e.g. Public speaking, Python…"
                value={draftLearn}
                onChange={setDraftLearn}
                onSelect={(name) => addSkill(learn, setLearn, name, setDraftLearn, "want")}
              />
              <button type="submit" className="btn btn-secondary btn-sm">Add</button>
            </form>
            <TagRow items={learn} tagClass="tag-learn" onRemove={(id) => removeSkill(learn, setLearn, id)} empty="None yet -- add as many as you're curious about." />
          </div>

          <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-6)" }}>
            <button type="button" className="btn btn-secondary" onClick={() => setStep(1)}>Back</button>
            <button type="button" className="btn btn-primary" onClick={finish}>Finish</button>
          </div>
        </div>
      )}
    </div>
  );
}

function TagRow({ items, tagClass, onRemove, empty }) {
  if (items.length === 0) return <p className="field-hint">{empty}</p>;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
      {items.map((s) => (
        <span key={s.id} className={`tag ${tagClass}`}>
          {s.name}
          <button
            type="button"
            onClick={() => onRemove(s.id)}
            aria-label={`Remove ${s.name}`}
            style={{ display: "inline-flex", border: "none", background: "none", cursor: "pointer", color: "inherit", padding: 0, marginLeft: "var(--space-1)" }}
          >
            <X size={14} />
          </button>
        </span>
      ))}
    </div>
  );
}
