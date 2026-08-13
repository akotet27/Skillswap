import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { apiJson, apiFetch, API_BASE } from "../api/client";
import { useAuth } from "../context/AuthContext";
import SkillAutocompleteInput from "../components/SkillAutocompleteInput";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();

  return (
    <div className="container" style={{ paddingTop: "var(--space-10)", paddingBottom: "var(--space-20)" }}>
      <p className="eyebrow">Your profile</p>
      <h1>Hi, {user.name.split(" ")[0]}</h1>

      <div style={{ display: "grid", gap: "var(--space-6)", gridTemplateColumns: "minmax(0,1fr)", maxWidth: 720 }}>
        <ProfileDetailsCard user={user} onSaved={refreshUser} />
        <SkillsCard />
        <AvailabilityCard />
      </div>
    </div>
  );
}

function ProfileDetailsCard({ user, onSaved }) {
  const [name, setName] = useState(user.name);
  const [timezone, setTimezone] = useState(user.timezone);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiJson("/api/users/me", { method: "PATCH", body: JSON.stringify({ name, timezone }) });
      await onSaved();
      setMessage("Saved.");
    } finally {
      setSaving(false);
    }
  }

  async function onPhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await apiFetch("/api/users/me/photo", { method: "POST", body: fd });
      if (res.ok) await onSaved();
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="card" style={{ padding: "var(--space-8)" }}>
      <h3>Profile details</h3>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-5)", marginBottom: "var(--space-6)" }}>
        <img
          src={user.photo_url ? `${API_BASE}${user.photo_url}` : "https://api.dicebear.com/7.x/initials/svg?seed=" + encodeURIComponent(user.name)}
          alt=""
          width={64}
          height={64}
          style={{ borderRadius: "999px", objectFit: "cover", border: "1px solid var(--border)" }}
        />
        <label className="btn btn-secondary btn-sm" style={{ cursor: "pointer" }}>
          {uploading ? "Uploading…" : "Change photo"}
          <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={onPhoto} />
        </label>
      </div>

      <form onSubmit={save}>
        <div className="field">
          <label htmlFor="name">Name</label>
          <input id="name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="tz">Timezone</label>
          <input id="tz" value={timezone} onChange={(e) => setTimezone(e.target.value)} />
          <span className="field-hint">IANA name, e.g. Africa/Kigali</span>
        </div>
        <button className="btn btn-primary" disabled={saving}>{saving ? "Saving…" : "Save changes"}</button>
        {message && <span style={{ marginLeft: "var(--space-4)", color: "var(--color-leaf)" }}>{message}</span>}
      </form>
    </section>
  );
}

function SkillsCard() {
  const [skills, setSkills] = useState([]);
  const [newSkill, setNewSkill] = useState("");
  const [type, setType] = useState("have");
  const [error, setError] = useState("");

  async function load() {
    setSkills(await apiJson("/api/users/me/skills"));
  }
  useEffect(() => {
    load();
  }, []);

  // Takes the name explicitly (not read from `newSkill` state) so it works
  // the same whether called from the form's submit (typed text + Enter/Add)
  // or straight from the autocomplete's onSelect (clicking a suggestion) --
  // the latter fires before the newSkill state re-render lands, so reading
  // state there would add the *previous* value. See OnboardingPage.jsx for
  // the same pattern.
  async function submitSkill(name) {
    const value = name.trim();
    if (!value) return;
    setError("");
    try {
      await apiJson("/api/users/me/skills", {
        method: "POST",
        body: JSON.stringify({ skill_name: value, category: "General", type }),
      });
      setNewSkill("");
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function removeSkill(id) {
    await apiFetch(`/api/users/me/skills/${id}`, { method: "DELETE" });
    await load();
  }

  const have = skills.filter((s) => s.type === "have");
  const want = skills.filter((s) => s.type === "want");

  return (
    <section className="card" style={{ padding: "var(--space-8)" }}>
      <h3>Skills</h3>
      {error && <div className="error-banner">{error}</div>}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submitSkill(newSkill);
        }}
        style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", marginBottom: "var(--space-6)", flexWrap: "wrap" }}
      >
        <SkillAutocompleteInput
          placeholder="e.g. Guitar, Excel, French…"
          value={newSkill}
          onChange={setNewSkill}
          onSelect={submitSkill}
        />
        <div className="segmented" role="radiogroup" aria-label="Skill type">
          <button
            type="button"
            role="radio"
            aria-checked={type === "have"}
            className={`segmented-btn${type === "have" ? " active" : ""}`}
            onClick={() => setType("have")}
          >
            I can teach
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={type === "want"}
            className={`segmented-btn${type === "want" ? " active" : ""}`}
            onClick={() => setType("want")}
          >
            I want to learn
          </button>
        </div>
        <button className="btn btn-primary btn-sm">Add</button>
      </form>

      <div style={{ marginBottom: "var(--space-5)" }}>
        <p className="eyebrow" style={{ marginBottom: "var(--space-2)" }}>I can teach</p>
        <TagList items={have} tagClass="tag-teach" onRemove={removeSkill} empty="No teaching skills yet." />
      </div>
      <div>
        <p className="eyebrow" style={{ marginBottom: "var(--space-2)" }}>I want to learn</p>
        <TagList items={want} tagClass="tag-learn" onRemove={removeSkill} empty="No learning goals yet." />
      </div>
    </section>
  );
}

function TagList({ items, tagClass, onRemove, empty }) {
  if (items.length === 0) return <p className="field-hint">{empty}</p>;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
      {items.map((s) => (
        <span key={s.id} className={`tag ${tagClass}`}>
          {s.skill.name}
          <button
            onClick={() => onRemove(s.id)}
            aria-label={`Remove ${s.skill.name}`}
            style={{ display: "inline-flex", border: "none", background: "none", cursor: "pointer", color: "inherit", padding: 0, marginLeft: "var(--space-1)" }}
          >
            <X size={14} />
          </button>
        </span>
      ))}
    </div>
  );
}

function AvailabilityCard() {
  const [blocks, setBlocks] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  async function load() {
    setBlocks(await apiJson("/api/users/me/availability"));
  }
  useEffect(() => {
    load();
  }, []);

  function addBlock() {
    setBlocks([...blocks, { day_of_week: 0, start_time: "18:00", end_time: "19:00", timezone: tz }]);
  }
  function updateBlock(i, patch) {
    setBlocks(blocks.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
  }
  function removeBlock(i) {
    setBlocks(blocks.filter((_, idx) => idx !== i));
  }

  // There's no "overnight block" concept -- a block is one day_of_week,
  // full stop -- so end <= start is always invalid, never a legitimate
  // "spans midnight" case. Caught here (and mirrored by the backend's own
  // check) so a bad block can't be saved and only surface as a confusing
  // error later, deep in someone else's booking flow.
  const invalidBlocks = blocks
    .map((b, i) => (b.end_time && b.start_time && b.end_time <= b.start_time ? i : null))
    .filter((i) => i !== null);

  async function save() {
    setError("");
    if (invalidBlocks.length > 0) {
      setError("End time must be after start time for every block -- fix the highlighted row(s) below.");
      return;
    }
    setSaving(true);
    try {
      const payload = blocks.map((b) => ({ ...b, day_of_week: Number(b.day_of_week) }));
      const saved = await apiJson("/api/users/me/availability", { method: "PUT", body: JSON.stringify(payload) });
      setBlocks(saved);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card" style={{ padding: "var(--space-8)" }}>
      <h3>Weekly availability</h3>
      <p>Recurring blocks of free time, in your local timezone ({tz}).</p>
      {error && <div className="error-banner">{error}</div>}

      {blocks.map((b, i) => {
        const invalid = invalidBlocks.includes(i);
        return (
          <div key={i}>
            <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "center", marginBottom: invalid ? "var(--space-1)" : "var(--space-3)" }}>
              <select value={b.day_of_week} onChange={(e) => updateBlock(i, { day_of_week: e.target.value })} style={{ flex: 1 }}>
                {DAYS.map((d, idx) => (
                  <option key={d} value={idx}>{d}</option>
                ))}
              </select>
              <input
                type="time"
                value={b.start_time}
                onChange={(e) => updateBlock(i, { start_time: e.target.value })}
                style={invalid ? { borderColor: "var(--color-coral)" } : undefined}
              />
              <span>to</span>
              <input
                type="time"
                value={b.end_time}
                onChange={(e) => updateBlock(i, { end_time: e.target.value })}
                style={invalid ? { borderColor: "var(--color-coral)" } : undefined}
              />
              <button className="btn btn-secondary btn-sm" onClick={() => removeBlock(i)} aria-label="Remove block">Remove</button>
            </div>
            {invalid && <span className="field-error" style={{ display: "block", marginBottom: "var(--space-3)" }}>End time must be after start time.</span>}
          </div>
        );
      })}

      <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-5)" }}>
        <button className="btn btn-secondary btn-sm" onClick={addBlock} type="button">+ Add block</button>
        <button className="btn btn-primary btn-sm" onClick={save} disabled={saving} type="button">
          {saving ? "Saving…" : "Save availability"}
        </button>
      </div>
    </section>
  );
}

// Two-factor auth now lives in Settings (see components/TwoFactorCard.jsx)
// -- account security, not public profile identity.
