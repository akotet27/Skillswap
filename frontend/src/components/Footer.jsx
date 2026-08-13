import { useState } from "react";
import { Link } from "react-router-dom";
import { Globe, Mail, MessageCircle, Share2, Check } from "lucide-react";
import { useAuth } from "../context/AuthContext";
// lucide-react dropped brand/logo icons (Facebook, Twitter, etc.) a while
// back -- generic icons stand in rather than guessing at brand marks.

const COLUMNS = [
  {
    title: "Platform",
    links: [
      { label: "Home", to: "/" },
      { label: "Browse", to: "/browse" },
      { label: "How It Works", to: "#how-it-works", external: true },
      { label: "Testimonials", to: "#testimonials", external: true },
    ],
  },
  {
    title: "Community",
    links: [
      { label: "Sign up", to: "/signup" },
      { label: "Log in", to: "/login" },
      { label: "Requests", to: "/requests" },
      { label: "Sessions", to: "/sessions" },
    ],
  },
  {
    title: "Support",
    links: [
      { label: "Contact us", to: "mailto:hello@skillswap.local", external: true },
      { label: "Report an issue", to: "mailto:hello@skillswap.local", external: true },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy Policy", to: "/privacy" },
      { label: "Terms and Conditions", to: "/terms" },
    ],
  },
];

const SITE_URL = "https://skillswap.local";

export default function Footer() {
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);

  async function onShare() {
    if (navigator.share) {
      try {
        await navigator.share({ title: "SkillSwap", text: "Trade skills, not cash.", url: SITE_URL });
        return;
      } catch {
        return; // user cancelled the native share sheet -- not an error
      }
    }
    try {
      await navigator.clipboard.writeText(SITE_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard access denied -- nothing more we can do here
    }
  }

  return (
    <footer className="site-footer">
      <div className="container" style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-10)" }}>
        <img src="/logo-icon-dark.png" alt="" width={28} height={28} style={{ borderRadius: 6 }} />
        <span style={{ color: "#fff", fontWeight: 600, fontSize: "var(--text-body-lg)" }}>SkillSwap</span>
      </div>

      <div className="container" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "var(--space-8)" }}>
        {COLUMNS.map((col) => (
          <div key={col.title}>
            <h4>{col.title}</h4>
            {col.links.map((l) =>
              l.external ? (
                <a key={l.label} href={l.to}>{l.label}</a>
              ) : (
                <Link key={l.label} to={l.to}>{l.label}</Link>
              )
            )}
          </div>
        ))}
      </div>

      <div className="container" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "var(--space-12)", paddingTop: "var(--space-6)", borderTop: "1px solid rgba(255,255,255,0.12)", flexWrap: "wrap", gap: "var(--space-4)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-4)" }}>
          <Link to="/" aria-label="SkillSwap home" className="footer-icon-link">
            <Globe size={18} />
          </Link>
          {user ? (
            <Link to="/messages" aria-label="Your messages" className="footer-icon-link">
              <MessageCircle size={18} />
            </Link>
          ) : (
            <a href="mailto:hello@skillswap.local" aria-label="Talk to us" className="footer-icon-link">
              <MessageCircle size={18} />
            </a>
          )}
          <button type="button" onClick={onShare} aria-label="Share SkillSwap" className="footer-icon-link" style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
            {copied ? <Check size={18} /> : <Share2 size={18} />}
          </button>
          <a href="mailto:hello@skillswap.local" aria-label="Email us" className="footer-icon-link">
            <Mail size={18} />
          </a>
        </div>
        <p style={{ margin: 0, color: "rgba(255,255,255,0.5)", fontSize: "var(--text-body-sm)" }}>
          © {new Date().getFullYear()} SkillSwap. Built for local development.
        </p>
      </div>
    </footer>
  );
}
