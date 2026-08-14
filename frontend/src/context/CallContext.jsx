import { createContext, useCallback, useContext, useState } from "react";

const CallContext = createContext(null);

/** Keeps a video call alive across route navigation. Without this,
 * navigating away from /session/:id would unmount VideoRoom, which tears
 * the whole WebRTC connection down (see useWebRTCRoom.js's cleanup
 * effect) -- there was no way to check Messages mid-call. The actual
 * <VideoRoom/> instance now lives in PersistentCallOverlay.jsx, mounted
 * once at the app root (see App.jsx) and never unmounted while a call is
 * active; SessionRoomPage.jsx only ever calls startCall()/restore(), it
 * never renders VideoRoom itself. */
export function CallProvider({ children }) {
  const [activeCall, setActiveCall] = useState(null);
  const [minimized, setMinimized] = useState(false);

  const startCall = useCallback((params) => {
    setActiveCall(params);
    setMinimized(false);
  }, []);
  const endCall = useCallback(() => {
    setActiveCall(null);
    setMinimized(false);
  }, []);
  const minimize = useCallback(() => setMinimized(true), []);
  const restore = useCallback(() => setMinimized(false), []);

  return (
    <CallContext.Provider value={{ activeCall, minimized, startCall, endCall, minimize, restore }}>
      {children}
    </CallContext.Provider>
  );
}

export function useCall() {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error("useCall must be used within a CallProvider");
  return ctx;
}
