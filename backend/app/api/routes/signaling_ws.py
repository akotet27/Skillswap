"""
Phase 4: the WebRTC signaling server. This endpoint's only job is
relaying SDP offers/answers and ICE candidates between peers in a room --
it never inspects or stores their contents, purely forwards via
`ConnectionManager.send_to()` / `.broadcast()` (see app/ws/connection_manager.py,
the same manager Phase 3's chat uses -- signaling, chat, and presence are
three message "types" over the same kind of connection, not three
different systems).

Message protocol (JSON, `type` field routes everything):

Client -> server:
  {"type": "offer" | "answer", "to": <peer_id>, "sdp": {...}}
  {"type": "ice-candidate", "to": <peer_id>, "candidate": {...}}
  {"type": "chat", "content": "..."}                     -- in-call text chat
  {"type": "reaction", "emoji": "..."}                   -- floating emoji overlay
  {"type": "publish-state", "state": "requesting"|"publishing"}
    {"type": "screen-share-state", "sharing": true|false}

Server -> client:
  {"type": "room-state", "state": "connected", "self_id": <id>,
   "members": [{"id", "name", "role"}, ...]}              -- sent once, right after join
  {"type": "peer-joined", "id", "name", "role"}            -- broadcast to existing members
  {"type": "peer-left", "id"}                              -- broadcast on disconnect
  {"type": "offer" | "answer" | "ice-candidate", "from": <id>, ...}  -- relayed verbatim
  {"type": "chat", "from": <id>, "name": ..., "content": ...}
  {"type": "reaction", "from": <id>, "emoji": ...}
  {"type": "publish-state", "from": <id>, "state": ...}

`room-state`/`publish-state` are explicit, named events on purpose (per
this project's build notes) rather than letting the frontend guess
connection state from side effects -- the UI should reflect what actually
happened, not infer it.

Full-mesh topology for group calls (spec-mandated for this project's
scope, no SFU/MCU): a new peer receives the current roster in its
`room-state` and is expected to initiate an `offer` to each existing
member; existing members do NOT re-offer to the newcomer, avoiding
glare (both sides offering simultaneously).
"""
import logging
import random
from datetime import datetime, timezone as tz

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.core.security import decode_access_token
from app.core.timeutils import as_utc
from app.db.session import SessionLocal
from app.models.messaging import Message, MessageType
from app.models.session import Session as SessionModel, SessionParticipant, ParticipantRole, SessionStatus
from app.models.user import User
from app.schemas.conversation import MessageOut
from app.services import attendance as attendance_service, booking, conversations as conv_service, video as video_service
from app.tasks.badge_tasks import award_session_badges
from app.ws.connection_manager import manager

_REAL_ROLES = (ParticipantRole.TEACHER.value, ParticipantRole.LEARNER.value)

router = APIRouter(tags=["signaling-ws"])
logger = logging.getLogger("skillswap.signaling")

# Per-room peer metadata (name/role) that ConnectionManager itself doesn't
# know about -- kept as a companion dict here rather than teaching the
# generic manager about video-specific concepts. Small dict, same
# lifetime rules as the manager's own room dict (cleaned up when empty).
_peer_info: dict[str, dict[int, dict]] = {}


def _new_guest_id() -> int:
    # Negative range never collides with a real (positive, autoincrement) user id.
    return -random.randint(1, 2**31 - 1)


async def _post_system_message(db: DbSession, session: SessionModel, actor_user_id: int, text: str) -> None:
    """Inserts a real Message row (type=system) into the conversation
    between this session's teacher and learner, and pushes it live to
    anyone with that conversation open -- "X joined/left the call" reads
    as an ordinary line in the transcript (Slack-style centered/muted,
    see ChatPage.jsx), not a client-side-only toast that vanishes on
    refresh. Guests never trigger this (only called for real roles) and
    are silently skipped if a real teacher/learner pairing can't be
    resolved (shouldn't happen in practice -- every session has both)."""
    teacher = next((p for p in session.participants if p.role == ParticipantRole.TEACHER), None)
    learner = next((p for p in session.participants if p.role == ParticipantRole.LEARNER), None)
    if teacher is None or learner is None:
        return
    conv = conv_service.get_or_create_conversation(db, teacher.user_id, learner.user_id)
    message = Message(conversation_id=conv.id, sender_id=actor_user_id, type=MessageType.SYSTEM, content=text)
    db.add(message)
    db.commit()
    db.refresh(message)
    await manager.broadcast(
        f"conv:{conv.id}", {"type": "chat", "message": MessageOut.model_validate(message).model_dump(mode="json")}
    )


async def _resolve_identity(websocket: WebSocket, db: DbSession, room_id: str) -> tuple[int, str, str] | None:
    """Returns (peer_id, display_name, role) or None if unauthorized."""
    params = websocket.query_params
    token = params.get("token")
    guest_token = params.get("guest_token")

    if token:
        try:
            payload = decode_access_token(token)
        except JWTError:
            return None
        user = db.get(User, int(payload["sub"]))
        if user is None:
            return None
        participant = db.scalar(
            select(SessionParticipant).join(SessionModel).where(
                SessionModel.video_room_id == room_id, SessionParticipant.user_id == user.id
            )
        )
        if participant is None:
            return None
        return user.id, user.name, participant.role.value

    if guest_token:
        try:
            video_service.verify_guest_token(guest_token, room_id)
        except video_service.InvalidGuestTokenError:
            return None
        # Unlike the JWT path, a guest's name is client-supplied, not
        # cryptographically bound to anything -- deliberate: guests are
        # low-trust observers by design (see the spec's guest-invite
        # section), and the token only gates *room access*, not identity.
        name = (params.get("name") or "Guest")[:60]
        return _new_guest_id(), name, ParticipantRole.GUEST.value

    return None


@router.websocket("/ws/room/{room_id}")
async def video_room_socket(websocket: WebSocket, room_id: str):
    db = SessionLocal()
    peer_id: int | None = None
    joined = False  # only true once this peer is actually registered in `room` --
    # guards the `finally` cleanup below from treating a *rejected* connection
    # (room full, unauthorized) as a departure of someone who was never announced.
    try:
        session = db.scalar(select(SessionModel).where(
            SessionModel.video_room_id == room_id))
        if session is None:
            await websocket.close(code=4404)  # room doesn't exist
            return
        if session.status not in (SessionStatus.SCHEDULED, SessionStatus.IN_PROGRESS):
            # gone -- session already completed/cancelled/no-show
            await websocket.close(code=4410)
            return

        identity = await _resolve_identity(websocket, db, room_id)
        if identity is None:
            # unauthenticated / not a participant
            await websocket.close(code=4401)
            return
        peer_id, name, role = identity

        room = _peer_info.setdefault(room_id, {})
        # max_participants caps real participants + guests together --
        # guests still take a media/bandwidth seat even though they never
        # touch the credit ledger.
        if len(room) >= session.max_participants:
            await websocket.close(code=4409)  # room full
            return

        await manager.connect(room_id, peer_id, websocket)
        existing_members = [{"id": pid, **{k: v for k, v in info.items() if k != "attendance_id"}} for pid, info in room.items()]
        attendance_id = None
        # Guests never get a CallAttendance row -- duration-based partial
        # credit (services/credits.py) only ever pays the teacher, and a
        # guest's presence is irrelevant to that calculation.
        if role in _REAL_ROLES:
            attendance_id = attendance_service.record_join(db, session.id, peer_id)
            db.commit()
        room[peer_id] = {"name": name, "role": role, "attendance_id": attendance_id}
        joined = True

        # Phase 5, step 1 (the "session actually started" half): the first
        # real participant to join flips scheduled -> in_progress. A guest
        # joining alone in an empty room doesn't count -- the swap itself
        # hasn't started until a teacher or learner shows up.
        if role in _REAL_ROLES:
            booking.mark_in_progress(db, session.id)
            db.commit()
            await _post_system_message(db, session, peer_id, f"{name} joined the call")

        await manager.send_to(
            room_id, peer_id, {"type": "room-state", "state": "connected",
                               "self_id": peer_id, "members": existing_members}
        )
        await manager.broadcast(room_id, {"type": "peer-joined", "id": peer_id, "name": name, "role": role}, exclude_user_id=peer_id)

        try:
            while True:
                data = await websocket.receive_json()
                msg_type = data.get("type")

                if msg_type in ("offer", "answer", "ice-candidate"):
                    to = data.get("to")
                    if not isinstance(to, int):
                        continue
                    relayed = {**data, "from": peer_id}
                    relayed.pop("to", None)
                    await manager.send_to(room_id, to, relayed)

                elif msg_type == "chat":
                    content = (data.get("content") or "").strip()
                    if not content:
                        continue
                    # Self-echo, same pattern as Phase 3's conversation chat --
                    # the client renders purely from what it receives back,
                    # never optimistically, so every client (including the
                    # sender) needs a copy.
                    await manager.broadcast(room_id, {"type": "chat", "from": peer_id, "name": name, "content": content})

                elif msg_type == "reaction":
                    emoji = data.get("emoji")
                    if not emoji:
                        continue
                    # No exclude_user_id -- same self-echo reasoning as
                    # chat above: the client only ever renders a reaction
                    # from what it receives back over the socket, never
                    # optimistically on click, so excluding the sender
                    # meant clicking a reaction produced no visible effect
                    # at all on your own screen (only other participants
                    # saw it fire).
                    await manager.broadcast(room_id, {"type": "reaction", "from": peer_id, "emoji": emoji})

                elif msg_type == "publish-state":
                    state = data.get("state")
                    if state not in ("requesting", "publishing"):
                        continue
                    await manager.broadcast(room_id, {"type": "publish-state", "from": peer_id, "state": state}, exclude_user_id=peer_id)

                elif msg_type == "screen-share-state":
                    sharing = bool(data.get("sharing"))
                    await manager.broadcast(
                        room_id,
                        {"type": "screen-share-state",
                            "from": peer_id, "sharing": sharing},
                        exclude_user_id=peer_id,
                    )

                # Unrecognized types are ignored, not errors -- forward-compatible
                # with new message kinds without a breaking change.

        except WebSocketDisconnect:
            pass

    finally:
        if joined:
            manager.disconnect(room_id, peer_id)
            room = _peer_info.get(room_id)
            left_info = None
            if room is not None:
                left_info = room.pop(peer_id, None)
                if not room:
                    del _peer_info[room_id]
                else:
                    await manager.broadcast(room_id, {"type": "peer-left", "id": peer_id})

            if role in _REAL_ROLES:
                attendance_id = (left_info or {}).get("attendance_id")
                if attendance_id is not None:
                    attendance_service.record_leave(db, attendance_id)
                    db.commit()
                await _post_system_message(db, session, peer_id, f"{name} left the call.")

            # Phase 5, step 1's automatic path: "both participants' sockets
            # disconnect from the video room after the scheduled end time."
            # Checked on every disconnect (not just the "last" one) since
            # room state is only known here, after this peer's already
            # removed -- if no teacher/learner is left in `room` (guests
            # don't count) and we're past the scheduled end, complete it.
            # complete_session()'s atomic guard makes this safe to call
            # redundantly (e.g. both peers leaving within the same second).
            remaining_roles = {info["role"] for info in (room or {}).values()}
            no_real_participants_left = not (
                remaining_roles & set(_REAL_ROLES))
            if no_real_participants_left and as_utc(session.scheduled_end_utc) <= datetime.now(tz.utc):
                if booking.complete_session(db, session.id):
                    db.commit()
                    logger.info(
                        "Session %s auto-completed (all participants left after scheduled end)", session.id)
        db.close()
