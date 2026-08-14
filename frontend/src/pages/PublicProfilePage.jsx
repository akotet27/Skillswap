import { useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { apiJson, API_BASE } from "../api/client";
import { useEffect, useState } from "react";

export default function PublicProfilePage() {
    const { identifier } = useParams();
    const { user } = useAuth();
    const navigate = useNavigate();
    const [profile, setProfile] = useState(null);
    const [error, setError] = useState("");

    useEffect(() => {
        setProfile(null);
        setError("");
        apiJson(`/api/users/public/${identifier}`)
            .then(setProfile)
            .catch((e) => setError(e.message));
    }, [identifier]);

    const bookTarget = useMemo(() => (profile ? `/book/${profile.id}` : "#"), [profile]);

    if (error) {
        return <div className="container" style={{ paddingTop: "var(--space-16)" }}><div className="error-banner">{error}</div></div>;
    }
    if (!profile) {
        return <div className="container" style={{ paddingTop: "var(--space-16)" }}>Loading…</div>;
    }

    const badges = profile.badges || [];

    return (
        <div className="container" style={{ maxWidth: 760, paddingTop: "var(--space-10)", paddingBottom: "var(--space-20)" }}>
            <div className="card" style={{ padding: "var(--space-8)", display: "grid", gap: "var(--space-6)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-5)", flexWrap: "wrap" }}>
                    <img
                        src={profile.photo_url ? `${API_BASE}${profile.photo_url}` : `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(profile.name)}`}
                        alt=""
                        width={88}
                        height={88}
                        style={{ borderRadius: "999px", objectFit: "cover", border: "1px solid var(--border)" }}
                    />
                    <div style={{ flex: 1, minWidth: 220 }}>
                        <p className="eyebrow">Public profile</p>
                        <h1 style={{ marginBottom: "var(--space-2)" }}>{profile.name}</h1>
                        <p className="field-hint" style={{ margin: 0 }}>
                            {profile.rating_count > 0
                                ? `${profile.rating_average.toFixed(1)} average from ${profile.rating_count} ratings`
                                : "No ratings yet"}
                        </p>
                        {profile.availability_summary && <p style={{ marginTop: "var(--space-2)" }}>{profile.availability_summary}</p>}
                        {badges.length > 0 && (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", marginTop: "var(--space-3)" }}>
                                {badges.map((badge) => (
                                    <span key={badge.badge_key} className="tag tag-neutral" title={badge.label}>
                                        {badge.label}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                    <button
                        className="btn btn-primary"
                        onClick={() => (user ? navigate(bookTarget) : navigate("/login"))}
                    >
                        Book a session
                    </button>
                </div>

                {profile.bio && (
                    <div>
                        <h3>About</h3>
                        <p style={{ marginBottom: 0 }}>{profile.bio}</p>
                    </div>
                )}

                <div>
                    <h3>Skills they teach</h3>
                    {profile.teach_skills.length === 0 ? (
                        <p className="field-hint">No teaching skills listed yet.</p>
                    ) : (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
                            {profile.teach_skills.map((skill) => (
                                <span key={skill.id} className="tag tag-teach">{skill.name}</span>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}