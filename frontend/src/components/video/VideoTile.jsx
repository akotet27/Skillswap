import { useEffect, useRef } from "react";

/** A single participant's video tile. Kept as its own component because
 * attaching a MediaStream to a <video> element is an imperative
 * `.srcObject =` assignment -- it has to happen in a ref effect, not
 * through props/JSX, so this boundary keeps that imperative bit small
 * and isolated from the rest of the room UI. */
export default function VideoTile({ stream, name, muted = false, isLocal = false, publishState, status, style }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream || null;
    }
  }, [stream]);

  return (
    <div
      style={{
        position: "relative",
        background: "#0d111b",
        borderRadius: "var(--space-3)",
        overflow: "hidden",
        aspectRatio: "16 / 10",
        // A tile's height is driven by its aspect-ratio off whatever
        // width its grid column ends up with -- fine in a multi-column
        // grid, but a *lone* tile (e.g. waiting for the other person to
        // join) gets the full row width, and on a wide screen that
        // computes a taller-than-viewport height, forcing the whole
        // page to scroll just to see the controls. Capping it here
        // means "cover" on the <video> below fills the box without
        // stretching, instead of the box itself growing unbounded.
        maxHeight: "min(58vh, 620px)",
        ...style,
      }}
    >
      {stream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={muted || isLocal}
          style={{ width: "100%", height: "100%", objectFit: "cover", transform: isLocal ? "scaleX(-1)" : "none" }}
        />
      ) : (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.5)", fontSize: "var(--text-body-sm)" }}>
          {publishState === "requesting" ? "Connecting…" : "No video"}
        </div>
      )}
      <div
        style={{
          position: "absolute",
          left: "var(--space-2)",
          bottom: "var(--space-2)",
          display: "flex",
          alignItems: "center",
          gap: "var(--space-1)",
          background: "rgba(0,0,0,0.5)",
          color: "#fff",
          fontSize: "var(--text-eyebrow)",
          fontWeight: 600,
          padding: "4px 8px",
          borderRadius: "var(--radius-pill)",
        }}
      >
        {name}
        {isLocal && " (you)"}
      </div>
      {status && (
        <div
          style={{
            position: "absolute",
            top: "var(--space-2)",
            right: "var(--space-2)",
            background: "rgba(0,0,0,0.55)",
            color: "#fff",
            fontSize: "var(--text-eyebrow)",
            fontWeight: 600,
            padding: "4px 8px",
            borderRadius: "var(--radius-pill)",
          }}
        >
          {status}
        </div>
      )}
    </div>
  );
}
