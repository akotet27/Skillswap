/** Small online/offline indicator -- green when the person has an active
 * WebSocket connection anywhere on SkillSwap right now (chat or video
 * call), grey otherwise. Shared visual so it reads the same everywhere
 * it shows up (conversation list, browse/match cards, chat header). */
export default function PresenceDot({ online, style }) {
  return (
    <span
      aria-label={online ? "Online" : "Offline"}
      title={online ? "Online" : "Offline"}
      style={{
        display: "inline-block",
        width: 9,
        height: 9,
        borderRadius: "50%",
        background: online ? "var(--color-leaf)" : "var(--text-disabled)",
        border: "2px solid var(--surface)",
        flexShrink: 0,
        ...style,
      }}
    />
  );
}
