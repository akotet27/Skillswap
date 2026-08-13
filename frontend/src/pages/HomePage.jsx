import { Link } from "react-router-dom";
import { Check } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import Footer from "../components/Footer";
import SkillMatchingShowcase from "../components/marketing/SkillMatchingShowcase";
import VideoSessionShowcase from "../components/marketing/VideoSessionShowcase";
import TrustCreditsFlow from "../components/marketing/TrustCreditsFlow";

const SKILL_CLOUD = [
  { name: "Python", type: "teach" },
  { name: "Conversational French", type: "learn" },
  { name: "UI Design", type: "teach" },
  { name: "Advanced SQL", type: "learn" },
  { name: "Watercolor", type: "teach" },
  { name: "Public Speaking", type: "learn" },
  { name: "Excel", type: "teach" },
  { name: "Guitar", type: "teach" },
  { name: "Spanish", type: "learn" },
  { name: "Video Editing", type: "learn" },
  { name: "Product Strategy", type: "teach" },
  { name: "Watercolor Painting", type: "learn" },
];

export default function HomePage() {
  const { user } = useAuth();

  return (
    <div>
      {/* --- Hero --- */}
      <div className="container hero-grid" style={{ paddingTop: "var(--space-16)", paddingBottom: "var(--space-20)", display: "grid", gap: "var(--space-12)", alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: "var(--text-display)" }}>Learn from Peers. Trade Your Time. No Money.</h1>
          <p style={{ fontSize: "var(--text-body-lg)" }}>
            Swap skills one-for-one. You teach for an hour, you earn a credit to learn from someone else.
          </p>
          <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-8)" }}>
            <Link to={user ? "/browse" : "/signup"} className="btn btn-primary">Find a Mentor</Link>
            <Link to={user ? "/profile" : "/signup"} className="btn btn-secondary">Offer a Skill</Link>
          </div>
        </div>

        {/* Match Card -- a complete illustration (not a photo), with its
            own stacked-card shadow effect baked in. */}
        <img
          src="/match-card-hero.png"
          alt="An example Match Card: a profile avatar, tagged with Python and Web Dev skills, and a 5-star rating."
          style={{ width: "100%", maxWidth: 320, justifySelf: "center", height: "auto", display: "block" }}
        />
      </div>

      {/* --- Seamless Skill Matching --- */}
      <section className="section" id="how-it-works">
        <div className="container">
          <SkillMatchingShowcase />
        </div>
      </section>

      {/* --- In-Browser Video Sessions --- */}
      <section className="section section-alt">
        <div className="container hero-grid" style={{ display: "grid", gap: "var(--space-12)", alignItems: "center" }}>
          <div>
            <h2>In-Browser Video Sessions</h2>
            <p>
              Every lesson happens right on SkillSwap — no Zoom links, no downloads. Your call connects directly
              between you and the other person, using video technology we built ourselves.
            </p>
            <ul style={{ listStyle: "none", padding: 0, margin: "var(--space-6) 0" }}>
              {["Integrated chat, with text and voice notes", "Emoji reaction buttons, overlayed live on the call"].map((item) => (
                <li key={item} style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-2)", marginBottom: "var(--space-3)", color: "var(--text-secondary)" }}>
                  <Check size={18} style={{ color: "var(--color-electric-blue)", flexShrink: 0, marginTop: 2 }} />
                  {item}
                </li>
              ))}
            </ul>
            <Link to={user ? "/sessions" : "/signup"} className="btn btn-primary">Join Session</Link>
          </div>

          <VideoSessionShowcase />
        </div>
      </section>

      {/* --- Trust and Credits --- */}
      <section className="section">
        <div className="container" style={{ maxWidth: 800, margin: "0 auto" }}>
          <TrustCreditsFlow />
        </div>
      </section>

      {/* --- Testimonials --- */}
      <section className="section section-alt" id="testimonials">
        <div className="container" style={{ textAlign: "center", maxWidth: 640, margin: "0 auto" }}>
          <h2>Testimonials</h2>
          <p style={{ marginBottom: "var(--space-8)" }}>Real trades, from people learning something new.</p>
          <p className="signature" style={{ fontSize: "var(--text-heading-sm)", color: "var(--text-heading)", lineHeight: 1.3 }}>
            "Taught UI design, learned advanced SQL. The best time investment."
          </p>
          <img
            src="/avatar-man-square.png"
            alt=""
            width={48}
            height={48}
            style={{ borderRadius: "999px", objectFit: "cover", margin: "var(--space-5) auto 0", display: "block" }}
          />
          <p style={{ marginTop: "var(--space-3)", fontWeight: 600, color: "var(--text-heading)" }}>
            — Michael Chen, <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>Data Scientist</span>
          </p>
        </div>
      </section>

      {/* --- Featured Skills --- */}
      <section className="section">
        <div className="container" style={{ textAlign: "center" }}>
          <h2 style={{ marginBottom: "var(--space-8)" }}>Featured Skills</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-3)", justifyContent: "center" }}>
            {SKILL_CLOUD.map((s) => (
              <span key={s.name} className={`tag ${s.type === "teach" ? "tag-teach" : "tag-learn"}`}>{s.name}</span>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
