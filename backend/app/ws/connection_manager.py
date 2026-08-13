"""
Hand-rolled WebSocket connection manager (deliberately not python-socketio --
see the spec's "build it yourself" requirement, same rationale as the
WebRTC signaling logic itself).

One ConnectionManager instance, shared across the whole app, backs THREE
logically distinct feature areas that all reuse the same "room" concept:
  - WebRTC signaling relay (Phase 4): room = Session.video_room_id
  - In-call chat + emoji reactions (Phase 4): same room, different `type`
  - Conversation text/voice-note chat (Phase 3): room = Conversation.id (prefixed)

Routing between those isn't done by ConnectionManager itself -- it just
tracks "which sockets are in which room" and can broadcast/send-to. The
`type` field inside each JSON message (e.g. "offer", "chat", "reaction",
"presence") is inspected by the route handler that owns a given endpoint,
not by this class. Keeping the manager dumb (just a room -> sockets map)
is what lets one class serve three different message-shaped use cases
without knowing anything about WebRTC, chat, or presence semantics.
"""
import logging
from collections import defaultdict

from fastapi import WebSocket

logger = logging.getLogger("skillswap.ws")


class ConnectionManager:
    def __init__(self) -> None:
        # room_id -> {user_id: WebSocket}. A dict (not a list) so we can
        # target send_to(room_id, user_id, ...) as well as broadcast, and
        # so a reconnect from the same user_id cleanly replaces the old
        # socket instead of accumulating stale entries.
        self._rooms: dict[str, dict[int, WebSocket]] = defaultdict(dict)

    async def connect(self, room_id: str, user_id: int, websocket: WebSocket) -> None:
        await websocket.accept()
        self._rooms[room_id][user_id] = websocket
        logger.debug("user %s joined room %s (%d in room)", user_id, room_id, len(self._rooms[room_id]))

    def disconnect(self, room_id: str, user_id: int) -> None:
        room = self._rooms.get(room_id)
        if not room:
            return
        room.pop(user_id, None)
        if not room:
            # Empty room -> drop the dict entry entirely so room state
            # doesn't leak memory across the app's lifetime.
            del self._rooms[room_id]

    def room_members(self, room_id: str) -> list[int]:
        return list(self._rooms.get(room_id, {}).keys())

    def is_online(self, user_id: int) -> bool:
        """"Online" means "has an active WS connection to *any* room right
        now" -- chat, video signaling, whichever. Derived from `_rooms`
        directly rather than a separate refcount: a user can be in more
        than one room at once (e.g. a video call and a different chat),
        so this is a genuine OR across all of them, not just the caller's
        own room."""
        return any(user_id in room for room in self._rooms.values())

    def online_ids(self, user_ids: list[int]) -> set[int]:
        """Bulk version of is_online -- for list views (conversations,
        browse) that need presence for many users at once without each
        opening its own WebSocket just to ask."""
        online: set[int] = set()
        for room in self._rooms.values():
            online.update(room.keys())
        return online & set(user_ids)

    async def send_to(self, room_id: str, user_id: int, message: dict) -> bool:
        ws = self._rooms.get(room_id, {}).get(user_id)
        if ws is None:
            return False
        await ws.send_json(message)
        return True

    async def broadcast(self, room_id: str, message: dict, exclude_user_id: int | None = None) -> None:
        """Send to every other member of the room. The server never
        inspects/stores `message` beyond routing it -- it's relayed
        verbatim, per the signaling requirement that SDP/ICE payloads pass
        through untouched."""
        for uid, ws in list(self._rooms.get(room_id, {}).items()):
            if uid == exclude_user_id:
                continue
            try:
                await ws.send_json(message)
            except Exception:
                logger.exception("failed to send to user %s in room %s; dropping connection", uid, room_id)
                self.disconnect(room_id, uid)


# Module-level singleton: one manager for the whole app process, imported
# by both the video-signaling router and the chat router.
manager = ConnectionManager()
