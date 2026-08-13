import { Users, RefreshCw, Sprout, ArrowRight } from "lucide-react";

/** Homepage credit-flow diagram -- previously an uploaded PNG with
 * garbled, grammatically-broken copy ("essentiv pending from available
 * to be clear in two premises") and a state label duplicated across two
 * steps. Rebuilt as real markup with accurate copy, matching the actual
 * 3-state credit ledger (pending -> available -> spent, see
 * app/services/credits.py) instead of a made-up flow. */

const STEPS = [
  { label: "Share Skills", state: "pending", desc: "Teach what you know", icon: Users },
  { label: "Earn Credits", state: "available", desc: "Get time to learn new skills", icon: RefreshCw },
  { label: "Grow Together", state: "spent", desc: "Use a credit, learn something new", icon: Sprout },
];

export default function TrustCreditsFlow() {
  return (
    <div className="card" style={{ padding: "var(--space-10) var(--space-8)" }}>
      <div style={{ textAlign: "center", marginBottom: "var(--space-10)" }}>
        <h2 style={{ marginBottom: "var(--space-3)" }}>Trust and Credits</h2>
        <p>Every credit moves through the same three states, so you always know where your time stands.</p>
      </div>

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "center", gap: "var(--space-6)", flexWrap: "wrap" }}>
        {STEPS.map((s, i) => (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: "var(--space-6)" }}>
            <div style={{ textAlign: "center", width: 150 }}>
              <span
                className="tag tag-neutral"
                style={{
                  marginBottom: "var(--space-3)",
                  textTransform: "lowercase",
                  ...(s.state === "available" && { background: "var(--color-teach-bg)", color: "var(--color-teach)", borderColor: "var(--color-teach-line)" }),
                  ...(s.state === "spent" && { background: "var(--color-learn-bg)", color: "var(--color-learn)", borderColor: "var(--color-learn-line)" }),
                }}
              >
                {s.state}
              </span>
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: "50%",
                  background: "var(--surface-alt)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "var(--space-3) auto",
                }}
              >
                <s.icon size={26} style={{ color: "var(--text-heading)" }} />
              </div>
              <p style={{ fontWeight: 700, color: "var(--text-heading)", margin: 0 }}>{s.label}</p>
              <p style={{ color: "var(--text-secondary)", fontSize: "var(--text-body-sm)", margin: 0 }}>{s.desc}</p>
            </div>
            {i < STEPS.length - 1 && <ArrowRight size={20} style={{ color: "var(--text-tertiary)", flexShrink: 0, marginTop: 34 }} />}
          </div>
        ))}
      </div>
    </div>
  );
}
