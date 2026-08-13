import { useState } from "react";
import { apiJson, API_BASE } from "../api/client";

export default function ProfileIdentityCard({ user, onChanged }) {
    const [name, setName] = useState(user.name);
    const [username, setUsername] = useState(user.username || "");
    const [bio, setBio] = useState(user.bio || "");
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState("");

    async function save(e) {
        e.preventDefault();
        setSaving(true);
        setMessage("");
        try {
            await apiJson("/api/users/me", {
                method: "PATCH",
                body: JSON.stringify({ name, username, bio }),
            });
            await onChanged();
            setMessage("Saved.");
        } finally {
            setSaving(false);
        }
    }

    const publicPath = user.username ? `/u/${user.username}` : `/u/${user.id}`;

    return (
        <section className="card" style={{ padding: "var(--space-8)" }}>
            <h3>Public profile</h3>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-5)", marginBottom: "var(--space-6)" }}>
                <img
                    src={user.photo_url ? `${API_BASE}${user.photo_url}` : "https://api.dicebear.com/7.x/initials/svg?seed=" + encodeURIComponent(user.name)}
                    alt=""
                    width={64}
                    height={64}
                    style={{ borderRadius: "999px", objectFit: "cover", border: "1px solid var(--border)" }}
                />
                <div>
                    <div className="field-hint" style={{ marginBottom: "var(--space-1)" }}>Your public link</div>
                    <a href={publicPath} target="_blank" rel="noreferrer">{publicPath}</a>
                </div>
            </div>

            <form onSubmit={save}>
                <div className="field">
                    <label htmlFor="public-name">Display name</label>
                    <input id="public-name" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="field">
                    <label htmlFor="username">Username</label>
                    <input id="username" value={username} onChange={(e) => setUsername(e.target.value)} />
                    <span className="field-hint">Used in your public SkillSwap link.</span>
                </div>
                <div className="field">
                    <label htmlFor="bio">Short bio</label>
                    <textarea id="bio" rows={4} value={bio} onChange={(e) => setBio(e.target.value)} />
                    <span className="field-hint">A short intro that appears on your public profile.</span>
                </div>
                <button className="btn btn-primary" disabled={saving}>{saving ? "Saving…" : "Save profile"}</button>
                {message && <span style={{ marginLeft: "var(--space-4)", color: "var(--color-leaf)" }}>{message}</span>}
            </form>
        </section>
    );
}