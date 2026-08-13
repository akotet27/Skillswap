"""
Phase 3 real-time chat WebSocket -- the ConnectionManager pattern applied
to conversations (see app/ws/connection_manager.py's module docstring for
why one manager class backs both this and the Phase 4 video-signaling
endpoint).

Browsers can't set custom headers on a WebSocket handshake, so the access
token travels as a query param (`?token=...`) instead of the usual
Authorization header. This is the standard workaround for browser-native
WebSocket auth; the token is still short-lived (15 min) same as everywhere
else, which bounds how long a leaked URL (e.g. in a proxy access log)
would remain useful.
"""
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from jose import JWTError
from sqlalchemy.orm import Session as DbSession

from app.core.security import decode_access_token
from app.db.session import SessionLocal
from app.models.messaging import Message, MessageType
from app.models.user import User
from app.schemas.conversation import MessageOut
from app.services import conversations as conv_service
from app.ws.connection_manager import manager

router = APIRouter(tags=["chat-ws"])
logger = logging.getLogger("skillswap.chat_ws")


def _room(conversation_id: int) -> str:
    return f"conv:{conversation_id}"


async def _authenticate(websocket: WebSocket, db: DbSession) -> User | None:
    token = websocket.query_params.get("token")
    if not token:
        return None
    try:
        payload = decode_access_token(token)
    except JWTError:
        return None
    return db.get(User, int(payload["sub"]))


@router.websocket("/ws/conversations/{conversation_id}")
async def conversation_socket(websocket: WebSocket, conversation_id: int):
    db = SessionLocal()
    try:
        user = await _authenticate(websocket, db)
        if user is None:
            # Closing before accept() rejects at the HTTP handshake level
            # (uvicorn responds 403, not a completed WS upgrade) rather
            # than a graceful in-protocol close -- confirmed against a
            # real client, not assumed. The distinct codes are still
            # useful for server-side logs even though a browser
            # WebSocket client can't read them at this stage (the
            # handshake never completes, so it only sees a generic error).
            await websocket.close(code=4401)  # unauthenticated
            return

        try:
            conv_service.assert_participant(db, conversation_id, user.id)
        except conv_service.NotAParticipantError:
            await websocket.close(code=4403)  # forbidden
            return

        # Snapshot who's already here *before* joining -- mirrors the video
        # room's room-state pattern (see signaling_ws.py): the newcomer
        # needs to know the other participant's current presence, not just
        # future changes, since presence updates from here on are only
        # broadcast to whoever's already connected when they happen.
        existing_members = manager.room_members(_room(conversation_id))
        await manager.connect(_room(conversation_id), user.id, websocket)
        for uid in existing_members:
            await manager.send_to(_room(conversation_id), user.id, {"type": "presence", "user_id": uid, "status": "online"})
        await manager.broadcast(
            _room(conversation_id), {"type": "presence", "user_id": user.id, "status": "online"}, exclude_user_id=user.id
        )

        try:
            while True:
                data = await websocket.receive_json()
                msg_type = data.get("type")

                if msg_type == "chat":
                    content = (data.get("content") or "").strip()
                    if not content:
                        continue
                    message = Message(
                        conversation_id=conversation_id, sender_id=user.id, type=MessageType.TEXT, content=content
                    )
                    db.add(message)
                    db.commit()
                    db.refresh(message)
                    await manager.broadcast(
                        _room(conversation_id),
                        {"type": "chat", "message": MessageOut.model_validate(message).model_dump(mode="json")},
                    )

                elif msg_type == "typing":
                    # Ephemeral, never persisted -- just relayed so the
                    # other participant can show a "typing…" indicator.
                    await manager.broadcast(
                        _room(conversation_id), {"type": "typing", "user_id": user.id}, exclude_user_id=user.id
                    )

                # Unrecognized types are ignored rather than erroring --
                # keeps this endpoint forward-compatible with new message
                # kinds (e.g. read receipts) without a breaking change.

        except WebSocketDisconnect:
            pass
        finally:
            manager.disconnect(_room(conversation_id), user.id)
            await manager.broadcast(
                _room(conversation_id), {"type": "presence", "user_id": user.id, "status": "offline"}
            )
    finally:
        db.close()
