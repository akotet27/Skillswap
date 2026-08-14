import { useState, useEffect, useRef, useCallback } from "react";
import "./HeroSessionCarousel.css";
import sessionLivingroom from "../../assets/session-livingroom.jpg";
import sessionCall from "../../assets/session-call.jpg";
import sessionLanguage from "../../assets/session-language.jpg";
import sessionWin from "../../assets/session-win.jpg";

/** Hero carousel for the homepage -- autoplay, hover-to-pause, prev/next,
 * dot nav, and a progress bar synced to the autoplay interval. Replaces
 * the static match-card illustration that used to sit in the hero. */
const SLIDES = [
  {
    src: sessionLivingroom,
    alt: "A learner on a video call from her sofa",
    caption: "Spanish for Python, Tuesday nights",
    duration: "1 credit · 60 min",
    name: "Ana R.",
    role: "Product Designer",
    teaches: "Spanish",
    wants: "Python",
  },
  {
    src: sessionCall,
    alt: "Two people in a video call",
    caption: "Pair session: SQL joins, live",
    duration: "1 credit · 45 min",
    name: "Heather R.",
    role: "Data Analyst",
    teaches: "SQL",
    wants: "Illustration",
  },
  {
    src: sessionLanguage,
    alt: "A language exchange call with chat bubbles",
    caption: "Conversation practice, no textbook",
    duration: "1 credit · 30 min",
    name: "Sabrina S.",
    role: "Translator",
    teaches: "Portuguese",
    wants: "Web Dev",
  },
  {
    src: sessionWin,
    alt: "A learner celebrating at her laptop",
    caption: "First deploy shipped — credit earned",
    duration: "Swap complete",
    name: "Michael C.",
    role: "Software Engineer",
    teaches: "React",
    wants: "Data Visual",
  },
];

export default function HeroSessionCarousel({ autoplay = true, intervalMs = 4500 }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const timerRef = useRef(null);

  const interval = Math.max(1200, intervalMs);

  const step = useCallback((delta) => {
    setIndex((i) => (i + delta + SLIDES.length) % SLIDES.length);
  }, []);

  const goTo = useCallback((n) => setIndex(n), []);

  // Autoplay -- re-arms on every index change.
  useEffect(() => {
    if (paused || !autoplay) return undefined;
    timerRef.current = setTimeout(() => step(1), interval);
    return () => clearTimeout(timerRef.current);
  }, [index, paused, autoplay, interval, step]);

  const current = SLIDES[index];

  return (
    <div className="hsc-root" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      {SLIDES.map((s, n) => (
        <div
          key={s.name}
          role="img"
          aria-label={s.alt}
          className="hsc-slide"
          style={{
            backgroundImage: `url("${s.src}")`,
            opacity: n === index ? 1 : 0,
            transform: n === index ? "scale(1.06)" : "scale(1)",
          }}
        />
      ))}

      <div className="hsc-gradient" />

      <div className="hsc-top-row">
        <div className="hsc-live-badge">
          <span className="hsc-live-dot" />
          <span className="hsc-live-text">Live swap</span>
        </div>
        <span className="hsc-counter">
          {index + 1} / {SLIDES.length}
        </span>
      </div>

      <div className="hsc-bottom">
        <div className="hsc-bottom-row">
          <div className="hsc-caption-block">
            <span className="hsc-caption">{current.caption}</span>
            <span className="hsc-meta">
              {current.name} · {current.role} · {current.duration}
            </span>
          </div>

          <div className="hsc-nav-btns">
            <button type="button" onClick={() => step(-1)} aria-label="Previous swap" className="hsc-nav-btn hsc-nav-btn-prev">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <button type="button" onClick={() => step(1)} aria-label="Next swap" className="hsc-nav-btn hsc-nav-btn-next">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          </div>
        </div>

        <div className="hsc-tags-row">
          <span className="hsc-tag hsc-tag-teach">Teaches {current.teaches}</span>
          <span className="hsc-tag hsc-tag-learn">Wants {current.wants}</span>

          <div className="hsc-dots">
            {SLIDES.map((s, n) => (
              <button
                key={s.name}
                type="button"
                onClick={() => goTo(n)}
                aria-label={`Show swap ${n + 1}`}
                className={`hsc-dot ${n === index ? "hsc-dot-active" : ""}`}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="hsc-progress-track">
        <div
          key={`fill-${index}`}
          className="hsc-progress-fill"
          style={{
            animationDuration: `${interval}ms`,
            animationPlayState: paused || !autoplay ? "paused" : "running",
            width: autoplay ? undefined : "100%",
          }}
        />
      </div>
    </div>
  );
}
