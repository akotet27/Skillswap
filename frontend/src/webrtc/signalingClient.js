/**
 * Thin wrapper around the raw signaling WebSocket (`/ws/room/{roomId}`).
 * Two responsibilities, both called out explicitly in this project's
 * WebRTC requirements rather than left implicit:
 *
 * 1. Explicit, named connection-state events -- "connecting" | "connected"
 *    | "failed" -- reported via `onStateChange` rather than making the
 *    UI infer state from side effects (a stray error event, a missing
 *    video frame). "connected" here means the WebSocket is open; the
 *    server's own `room-state` message (see useWebRTCRoom) carries the
 *    room roster once that arrives.
 * 2. Bounded retry with backoff on disconnect, not infinite silent
 *    retry -- a handful of attempts with growing delay, then report
 *    "failed" and stop, so the UI can show a real "couldn't connect"
 *    error instead of spinning forever.
 */
const RETRY_DELAYS_MS = [500, 1000, 2000, 4000, 8000]; // bounded: 5 attempts, then give up

export class SignalingClient {
  constructor(url, { onMessage, onStateChange }) {
    this.url = url;
    this.onMessage = onMessage;
    this.onStateChange = onStateChange;
    this.ws = null;
    this.retryCount = 0;
    this.deliberateClose = false;
    this.retryTimer = null;
  }

  connect() {
    this.deliberateClose = false;
    this._open();
  }

  _open() {
    this.onStateChange("connecting");
    const ws = new WebSocket(this.url);
    this.ws = ws;

    ws.onopen = () => {
      this.retryCount = 0;
      this.onStateChange("connected");
    };

    ws.onmessage = (event) => {
      try {
        this.onMessage(JSON.parse(event.data));
      } catch {
        // Malformed frame -- ignore rather than crash the whole call.
      }
    };

    ws.onclose = () => {
      if (this.deliberateClose) return;
      if (this.retryCount >= RETRY_DELAYS_MS.length) {
        this.onStateChange("failed");
        return;
      }
      const delay = RETRY_DELAYS_MS[this.retryCount];
      this.retryCount += 1;
      this.onStateChange("connecting");
      this.retryTimer = setTimeout(() => this._open(), delay);
    };

    ws.onerror = () => {
      // onclose always follows onerror for a WebSocket -- the retry
      // decision lives there so it isn't made twice.
    };
  }

  send(message) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  close() {
    this.deliberateClose = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.ws?.close();
  }
}
