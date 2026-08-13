import { useCallback, useEffect, useRef, useState } from "react";
import { apiJson, API_BASE } from "../api/client";
import { SignalingClient } from "./signalingClient";

const WS_BASE = import.meta.env.VITE_WS_BASE_URL || "ws://localhost:8000";
const FALLBACK_STUN = [{ urls: "stun:stun.l.google.com:19302" }];
const REACTION_LIFETIME_MS = 3000;

/**
 * Drives one video-room's worth of full-mesh RTCPeerConnections off the
 * signaling WebSocket. This is the client-side half of the handshake
 * documented in app/api/routes/signaling_ws.py -- see that file's
 * docstring for the message protocol both sides agree on.
 *
 * Offer/answer glare avoidance for full-mesh (spec-mandated topology,
 * no SFU): only the *newly joining* peer initiates offers, to everyone
 * already in the room's roster (from the `room-state` message). Existing
 * members never re-offer to a newcomer -- they just wait for the
 * newcomer's offer. This one-directional rule is the whole trick to
 * avoiding both sides emitting simultaneous offers.
 */
export function useWebRTCRoom({ roomId, token, guestToken, guestName }) {
  const [connectionState, setConnectionState] = useState("connecting"); // connecting | connected | failed
  const [selfId, setSelfId] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState(new Map()); // peerId -> {stream, name, role}
  const [publishStates, setPublishStates] = useState(new Map()); // peerId -> "requesting" | "publishing"
  const [localStream, setLocalStream] = useState(null);
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [chatMessages, setChatMessages] = useState([]);
  const [reactions, setReactions] = useState([]); // [{id, emoji, from}], transient
  const [mediaError, setMediaError] = useState(null);

  const signalingRef = useRef(null);
  const peersRef = useRef(new Map()); // peerId -> RTCPeerConnection
  const pendingCandidatesRef = useRef(new Map()); // peerId -> ICE candidates queued before remoteDescription is set
  const iceServersRef = useRef(FALLBACK_STUN);
  const localStreamRef = useRef(null);

  const closePeer = useCallback((peerId) => {
    peersRef.current.get(peerId)?.close();
    peersRef.current.delete(peerId);
    pendingCandidatesRef.current.delete(peerId);
    setRemoteStreams((prev) => {
      const next = new Map(prev);
      next.delete(peerId);
      return next;
    });
    setPublishStates((prev) => {
      const next = new Map(prev);
      next.delete(peerId);
      return next;
    });
  }, []);

  const createPeerConnection = useCallback(
    (peerId) => {
      const pc = new RTCPeerConnection({ iceServers: iceServersRef.current });

      if (localStreamRef.current) {
        for (const track of localStreamRef.current.getTracks()) {
          pc.addTrack(track, localStreamRef.current);
        }
      }

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          signalingRef.current?.send({ type: "ice-candidate", to: peerId, candidate: event.candidate.toJSON() });
        }
      };

      pc.ontrack = (event) => {
        setRemoteStreams((prev) => {
          const next = new Map(prev);
          const existing = next.get(peerId) || {};
          next.set(peerId, { ...existing, stream: event.streams[0] });
          return next;
        });
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" || pc.connectionState === "closed") {
          // A single peer's connection dying doesn't fail the whole call
          // (see room-level connectionState above, which tracks the
          // signaling socket) -- just drop that one tile.
          closePeer(peerId);
        }
      };

      peersRef.current.set(peerId, pc);
      return pc;
    },
    [closePeer]
  );

  const flushPendingCandidates = useCallback(async (peerId, pc) => {
    const queued = pendingCandidatesRef.current.get(peerId);
    if (!queued) return;
    for (const candidate of queued) {
      await pc.addIceCandidate(candidate).catch(() => {});
    }
    pendingCandidatesRef.current.delete(peerId);
  }, []);

  const handleSignalingMessage = useCallback(
    async (msg) => {
      switch (msg.type) {
        case "room-state": {
          setSelfId(msg.self_id);
          setRemoteStreams((prev) => {
            const next = new Map(prev);
            for (const m of msg.members) next.set(m.id, { name: m.name, role: m.role, stream: next.get(m.id)?.stream });
            return next;
          });
          // We're the newcomer -- offer to everyone already here.
          for (const member of msg.members) {
            const pc = createPeerConnection(member.id);
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            signalingRef.current?.send({ type: "offer", to: member.id, sdp: offer });
          }
          break;
        }
        case "peer-joined": {
          setRemoteStreams((prev) => new Map(prev).set(msg.id, { name: msg.name, role: msg.role, stream: prev.get(msg.id)?.stream }));
          createPeerConnection(msg.id); // wait for their offer, don't send one ourselves
          break;
        }
        case "peer-left": {
          closePeer(msg.id);
          break;
        }
        case "offer": {
          const pc = peersRef.current.get(msg.from) || createPeerConnection(msg.from);
          await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
          await flushPendingCandidates(msg.from, pc);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          signalingRef.current?.send({ type: "answer", to: msg.from, sdp: answer });
          break;
        }
        case "answer": {
          const pc = peersRef.current.get(msg.from);
          if (pc) {
            await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
            await flushPendingCandidates(msg.from, pc);
          }
          break;
        }
        case "ice-candidate": {
          const pc = peersRef.current.get(msg.from);
          const candidate = new RTCIceCandidate(msg.candidate);
          if (pc && pc.remoteDescription) {
            await pc.addIceCandidate(candidate).catch(() => {});
          } else {
            const queue = pendingCandidatesRef.current.get(msg.from) || [];
            queue.push(candidate);
            pendingCandidatesRef.current.set(msg.from, queue);
          }
          break;
        }
        case "chat": {
          setChatMessages((prev) => [...prev, { id: `${msg.from}-${Date.now()}-${Math.random()}`, from: msg.from, name: msg.name, content: msg.content }]);
          break;
        }
        case "reaction": {
          const id = `${msg.from}-${Date.now()}-${Math.random()}`;
          setReactions((prev) => [...prev, { id, emoji: msg.emoji, from: msg.from }]);
          setTimeout(() => setReactions((prev) => prev.filter((r) => r.id !== id)), REACTION_LIFETIME_MS);
          break;
        }
        case "publish-state": {
          setPublishStates((prev) => new Map(prev).set(msg.from, msg.state));
          break;
        }
        default:
          break; // forward-compatible: unknown types are ignored, not errors
      }
    },
    [createPeerConnection, closePeer, flushPendingCandidates]
  );

  useEffect(() => {
    let cancelled = false;

    async function start() {
      // ICE servers: only fetchable via the authenticated endpoint, so
      // guests (no access token) fall back to STUN-only -- a documented
      // simplification, not an oversight (see hook docstring context).
      if (token) {
        try {
          const res = await apiJson("/api/video/ice-servers");
          iceServersRef.current = res.ice_servers;
        } catch {
          iceServersRef.current = FALLBACK_STUN;
        }
      }

      setMediaError(null);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        localStreamRef.current = stream;
        setLocalStream(stream);
      } catch (err) {
        setMediaError(err.message || "Could not access camera/microphone");
        // Continue anyway -- the user can still join as a listen/watch-only
        // participant rather than being fully blocked from the call.
      }

      const qs = token ? `token=${token}` : `guest_token=${guestToken}&name=${encodeURIComponent(guestName || "Guest")}`;
      const client = new SignalingClient(`${WS_BASE}/ws/room/${roomId}?${qs}`, {
        onMessage: handleSignalingMessage,
        onStateChange: setConnectionState,
      });
      signalingRef.current = client;
      client.connect();

      client.send({ type: "publish-state", state: localStreamRef.current ? "publishing" : "requesting" });
    }

    start();

    return () => {
      cancelled = true;
      signalingRef.current?.close();
      for (const pc of peersRef.current.values()) pc.close();
      peersRef.current.clear();
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, token, guestToken]);

  const toggleMic = useCallback(() => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMicEnabled(track.enabled);
  }, []);

  const toggleCamera = useCallback(() => {
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setCameraEnabled(track.enabled);
  }, []);

  const sendChat = useCallback((content) => {
    signalingRef.current?.send({ type: "chat", content });
  }, []);

  const sendReaction = useCallback((emoji) => {
    signalingRef.current?.send({ type: "reaction", emoji });
  }, []);

  const hangUp = useCallback(() => {
    signalingRef.current?.close();
    for (const pc of peersRef.current.values()) pc.close();
    peersRef.current.clear();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  return {
    connectionState,
    selfId,
    localStream,
    remoteStreams,
    publishStates,
    micEnabled,
    cameraEnabled,
    mediaError,
    chatMessages,
    reactions,
    toggleMic,
    toggleCamera,
    sendChat,
    sendReaction,
    hangUp,
  };
}

export { API_BASE };
