import { useEffect, useRef, useState } from "react";
import { apiJson } from "../api/client";

const POLL_MS = 20000;

/** Bulk online/offline lookup for a list of user ids (GET /api/users/presence),
 * polled periodically -- for list views (conversation list, browse cards)
 * that need presence for many people at once without each opening its own
 * WebSocket. The live chat page itself gets instant push updates over its
 * own socket instead; this is the "good enough, low-effort" version for
 * everywhere else. Returns a plain {id: boolean} map. */
export function usePresence(ids) {
  const [presence, setPresence] = useState({});
  // Stable string key so the effect doesn't re-run every render just
  // because the caller passed a new array instance with the same ids.
  const key = ids && ids.length ? [...new Set(ids)].sort((a, b) => a - b).join(",") : "";
  const keyRef = useRef(key);
  keyRef.current = key;

  useEffect(() => {
    if (!key) {
      setPresence({});
      return;
    }
    let cancelled = false;

    async function poll() {
      try {
        const result = await apiJson(`/api/users/presence?ids=${key}`);
        if (!cancelled && keyRef.current === key) setPresence(result);
      } catch {
        // Best-effort -- presence dots just stay at their last-known
        // state if a poll fails, not worth surfacing as a page error.
      }
    }

    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [key]);

  return presence;
}
