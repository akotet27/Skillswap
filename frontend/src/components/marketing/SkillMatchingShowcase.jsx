import { Star } from "lucide-react";

/** Homepage "how it works" showcase -- previously a single uploaded PNG
 * (real stock photos, baked-in text, fixed light background that broke
 * in dark mode). Rebuilt as real markup: DiceBear-illustrated avatars
 * (consistent with the login/signup illustration, and with how
 * ProfilePage already handles avatars) instead of stock photography, and
 * the .tag-teach/.tag-learn chips already used everywhere else in the
 * app, so this reads as "the product" rather than a disconnected ad. */

const PEOPLE = [
  { name: "Sarah J.", role: "Web Developer", teaches: "Graphic Design", wants: "Data Visualization", rating: 4, seed: "Sarah-Showcase", bg: "cfeafa" },
  { name: "Michael C.", role: "Software Engineer", teaches: "Python", wants: "SQL", rating: 5, seed: "Michael-Showcase", bg: "e1e0fc" },
  { name: "Jason K.", role: "Data Scientist", teaches: "SQL", wants: "Python", rating: 5, seed: "Jason-Showcase", bg: "eaf4dc" },
  { name: "Li W.", role: "Aspiring Data Analyst", teaches: "Data Visualization", wants: "Graphic Design", rating: 5, seed: "Li-Showcase", bg: "f6d2f4" },
];

function avatarUrl(seed, bg) {
  return `https://api.dicebear.com/7.x/personas/svg?seed=${encodeURIComponent(seed)}&backgroundColor=${bg}`;
}

export default function SkillMatchingShowcase() {
  return (
    <div>
      <div style={{ textAlign: "center", maxWidth: 640, margin: "0 auto var(--space-10)" }}>
        <h2 style={{ marginBottom: "var(--space-3)" }}>Seamless Skill Matching</h2>
        <p>
          We surface people whose skills complement yours — they teach what you want to learn, and want to learn
          what you teach.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "var(--space-5)" }}>
        {PEOPLE.map((p) => (
          <div key={p.name} className="card" style={{ padding: "var(--space-6)", textAlign: "center" }}>
            <img
              src={avatarUrl(p.seed, p.bg)}
              alt=""
              width={72}
              height={72}
              style={{ borderRadius: "50%", margin: "0 auto var(--space-3)", display: "block", background: `#${p.bg}` }}
            />
            <p style={{ fontWeight: 700, color: "var(--text-heading)", margin: 0 }}>{p.name}</p>
            <p style={{ color: "var(--text-secondary)", fontSize: "var(--text-body-sm)", marginBottom: "var(--space-4)" }}>{p.role}</p>

            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", alignItems: "center", marginBottom: "var(--space-4)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                <span className="eyebrow">Teaches</span>
                <span className="tag tag-teach">{p.teaches}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                <span className="eyebrow">Wants</span>
                <span className="tag tag-learn">{p.wants}</span>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "center", gap: 2 }} aria-label={`${p.rating} out of 5 stars`}>
              {[1, 2, 3, 4, 5].map((i) => (
                <Star key={i} size={16} fill={i <= p.rating ? "#f5a623" : "none"} color="#f5a623" strokeWidth={1.5} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
