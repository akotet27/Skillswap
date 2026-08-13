/** Decorative side panel for the auth pages -- a cluster of "matched"
 * people radiating out from a center bubble, the same visual idea as a
 * lot of consumer-app login screens (concentric rings, floating avatar
 * circles, a bottom tagline pill) but built from SkillSwap's own palette
 * and framed around skill-matching rather than video calling. Avatars are
 * DiceBear "personas" illustrations (seeded, so stable per name) --
 * clearly stylized, not real photos, consistent with how ProfilePage
 * already uses DiceBear for placeholder avatars. */

const PEOPLE = [
  { name: "Maya", skill: "Guitar", seed: "Maya-SkillSwap", bg: "cfeafa", top: "2%", left: "18%" },
  { name: "Théo", skill: "Python", seed: "Theo-SkillSwap", bg: "e1e0fc", top: "0%", left: "62%" },
  { name: "Amara", skill: "Yoga", seed: "Amara-SkillSwap", bg: "eaf4dc", top: "38%", left: "0%" },
  { name: "Lucas", skill: "Spanish", seed: "Lucas-SkillSwap", bg: "f6d2f4", top: "40%", left: "80%" },
  { name: "Priya", skill: "Baking", seed: "Priya-SkillSwap", bg: "cfeafa", top: "68%", left: "34%" },
];

const CENTER_SEEDS = ["You-SkillSwap", "Nadia-SkillSwap", "Kofi-SkillSwap"];

function avatarUrl(seed, bg) {
  return `https://api.dicebear.com/7.x/personas/svg?seed=${encodeURIComponent(seed)}&backgroundColor=${bg}`;
}

export default function MatchClusterIllustration() {
  return (
    <div
      style={{
        position: "relative",
        height: "100%",
        minHeight: 560,
        borderRadius: "var(--radius-card)",
        overflow: "hidden",
        background: "linear-gradient(160deg, var(--color-ice) 0%, var(--color-lavender) 55%, var(--color-blush) 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "var(--space-10) var(--space-8)",
      }}
    >
      <div style={{ textAlign: "center", maxWidth: 320 }}>
        <p className="eyebrow" style={{ color: "var(--color-midnight)" }}>SkillSwap</p>
        <h2 style={{ fontSize: "var(--text-subheading)", color: "var(--color-midnight)", marginBottom: "var(--space-2)" }}>
          Learn from real people
        </h2>
        <p style={{ color: "var(--color-carbon)", margin: 0 }}>
          Every session here is a trade -- someone teaching what they know, learning what they don't.
        </p>
      </div>

      <div style={{ position: "relative", width: "100%", maxWidth: 340, aspectRatio: "1 / 1", flexShrink: 0 }}>
        {/* Concentric rings, purely decorative */}
        {[92, 68, 44].map((size) => (
          <div
            key={size}
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              width: `${size}%`,
              height: `${size}%`,
              transform: "translate(-50%, -50%)",
              borderRadius: "50%",
              border: "1px solid rgba(13, 17, 27, 0.12)",
            }}
          />
        ))}

        {/* Center cluster: three small overlapping avatars = "you've been matched" */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            display: "flex",
            alignItems: "center",
            zIndex: 2,
          }}
        >
          {CENTER_SEEDS.map((seed, i) => (
            <img
              key={seed}
              src={avatarUrl(seed, "ffffff")}
              alt=""
              width={40}
              height={40}
              style={{
                borderRadius: "50%",
                border: "2px solid var(--color-paper)",
                marginLeft: i === 0 ? 0 : -14,
                boxShadow: "0 2px 8px rgba(13,17,27,0.15)",
                position: "relative",
                zIndex: CENTER_SEEDS.length - i,
              }}
            />
          ))}
        </div>
        <p
          style={{
            position: "absolute",
            top: "calc(50% + 26px)",
            left: "50%",
            transform: "translateX(-50%)",
            margin: 0,
            fontSize: "var(--text-eyebrow)",
            fontWeight: 700,
            letterSpacing: "0.04em",
            color: "var(--color-midnight)",
          }}
        >
          Match
        </p>

        {/* Floating avatars around the rings */}
        {PEOPLE.map((p) => (
          <div key={p.name} style={{ position: "absolute", top: p.top, left: p.left, textAlign: "center", width: 76 }}>
            <img
              src={avatarUrl(p.seed, p.bg)}
              alt=""
              width={56}
              height={56}
              style={{
                borderRadius: "50%",
                border: "3px solid var(--color-paper)",
                boxShadow: "0 4px 14px rgba(13,17,27,0.14)",
                display: "block",
                margin: "0 auto",
                background: `#${p.bg}`, // shows immediately, before the remote SVG loads
              }}
            />
            <p style={{ margin: "var(--space-2) 0 0", fontSize: "var(--text-eyebrow)", fontWeight: 600, color: "var(--color-ink)" }}>{p.name}</p>
            <p style={{ margin: 0, fontSize: "var(--text-eyebrow)", color: "var(--color-smoke)" }}>{p.skill}</p>
          </div>
        ))}
      </div>

      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          padding: "var(--space-2) var(--space-5)",
          borderRadius: "var(--radius-pill)",
          background: "var(--color-paper)",
          color: "var(--color-midnight)",
          fontWeight: 600,
          fontSize: "var(--text-body-sm)",
          boxShadow: "var(--shadow-float)",
        }}
      >
        Trade skills, not cash
      </span>
    </div>
  );
}
