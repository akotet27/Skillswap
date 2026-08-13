"""
Phase 3 messaging REST surface: conversation list/creation, paginated
message history, and voice-note upload. Real-time delivery of new
messages happens over the WebSocket endpoint in
app/api/routes/chat_ws.py, which shares the same ConnectionManager
instance -- a voice note uploaded here is broadcast to the room from this
handler too, so both message types reach connected peers the same way.
"""
import os
import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.core.config import settings
from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.messaging import Message, MessageType
from app.models.user import User
from app.schemas.conversation import ConversationCreate, ConversationOut, MessageOut, UpcomingSessionOut
from app.services import conversations as conv_service
from app.ws.connection_manager import manager

router = APIRouter(prefix="/api/conversations", tags=["conversations"])


def _conversation_room(conversation_id: int) -> str:
    # Namespaced so a Conversation id and a Session.video_room_id (Phase 4)
    # can never collide in the shared ConnectionManager's room dict.
    return f"conv:{conversation_id}"


@router.post("", response_model=ConversationOut, status_code=status.HTTP_201_CREATED)
def create_or_get_conversation(
    payload: ConversationCreate, user: User = Depends(get_current_user), db: DbSession = Depends(get_db)
):
    if payload.other_user_id == user.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Can't start a conversation with yourself")
    if db.get(User, payload.other_user_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    conv = conv_service.get_or_create_conversation(db, user.id, payload.other_user_id)
    db.commit()
    other = db.get(User, payload.other_user_id)
    return ConversationOut(id=conv.id, other_user=other, last_message=conv_service.last_message(db, conv.id), created_at=conv.created_at)


@router.get("", response_model=list[ConversationOut])
def list_conversations(user: User = Depends(get_current_user), db: DbSession = Depends(get_db)):
    convs = conv_service.list_conversations_for_user(db, user.id)
    out = []
    for conv in convs:
        other_id = conv_service.other_participant_id(db, conv.id, user.id)
        other = db.get(User, other_id) if other_id else None
        if other is None:
            continue
        out.append(ConversationOut(id=conv.id, other_user=other, last_message=conv_service.last_message(db, conv.id), created_at=conv.created_at))
    out.sort(key=lambda c: c.last_message.created_at if c.last_message else c.created_at, reverse=True)
    return out


@router.get("/{conversation_id}", response_model=ConversationOut)
def get_conversation(conversation_id: int, user: User = Depends(get_current_user), db: DbSession = Depends(get_db)):
    try:
        conv = conv_service.assert_participant(db, conversation_id, user.id)
    except conv_service.NotAParticipantError as e:
        raise HTTPException(status.HTTP_403_FORBIDDEN, str(e))
    other_id = conv_service.other_participant_id(db, conv.id, user.id)
    other = db.get(User, other_id) if other_id else None
    return ConversationOut(id=conv.id, other_user=other, last_message=conv_service.last_message(db, conv.id), created_at=conv.created_at)


@router.get("/{conversation_id}/messages", response_model=list[MessageOut])
def get_messages(
    conversation_id: int,
    before_id: int | None = None,
    limit: int = 50,
    user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
):
    try:
        conv_service.assert_participant(db, conversation_id, user.id)
    except conv_service.NotAParticipantError as e:
        raise HTTPException(status.HTTP_403_FORBIDDEN, str(e))

    query = select(Message).where(Message.conversation_id == conversation_id)
    if before_id is not None:
        query = query.where(Message.id < before_id)
    # Tiebreak by id, not just created_at: two messages sent within the
    # same clock tick (SQLite's default timestamp resolution is 1 second;
    # this is also just good practice regardless of DB backend) sort
    # ambiguously on created_at alone, and reversing an ambiguously-DESC
    # list doesn't reliably reconstruct chronological order. id is
    # monotonically increasing, so it's a reliable secondary key. Caught
    # by a live two-client WebSocket test, not just an import check.
    messages = db.scalars(
        query.order_by(Message.created_at.desc(), Message.id.desc()).limit(min(limit, 100))
    ).all()
    return list(reversed(messages))  # oldest-first, matching how a chat window renders


@router.get("/{conversation_id}/session", response_model=UpcomingSessionOut | None)
def get_upcoming_session(conversation_id: int, user: User = Depends(get_current_user), db: DbSession = Depends(get_db)):
    try:
        conv_service.assert_participant(db, conversation_id, user.id)
    except conv_service.NotAParticipantError as e:
        raise HTTPException(status.HTTP_403_FORBIDDEN, str(e))

    other_id = conv_service.other_participant_id(db, conversation_id, user.id)
    if other_id is None:
        return None
    session = conv_service.find_relevant_session(db, user.id, other_id)
    if session is None:
        return None
    return UpcomingSessionOut(
        id=session.id,
        scheduled_start_utc=session.scheduled_start_utc,
        scheduled_end_utc=session.scheduled_end_utc,
        status=session.status.value,
        video_room_id=session.video_room_id,
    )


@router.post("/{conversation_id}/messages/voice", response_model=MessageOut, status_code=status.HTTP_201_CREATED)
async def upload_voice_note(
    conversation_id: int,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
):
    try:
        conv_service.assert_participant(db, conversation_id, user.id)
    except conv_service.NotAParticipantError as e:
        raise HTTPException(status.HTTP_403_FORBIDDEN, str(e))

    # MediaRecorder in the browser defaults to audio/webm (Chrome/Firefox)
    # or audio/mp4 (Safari) -- accept the common outputs rather than
    # requiring the client to transcode. A bare `new MediaRecorder(stream)`
    # (no explicit mimeType, which is what ChatPage.jsx does) reports its
    # *actual* mimeType with a codec suffix, e.g. "audio/webm;codecs=opus"
    # -- comparing that exact string against the allow-list rejected every
    # real recording ever sent. Compare only the base type.
    content_type = (file.content_type or "").split(";", 1)[0].strip()
    allowed = {"audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav"}
    if content_type not in allowed:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unsupported audio type: {file.content_type}")

    contents = await file.read(settings.MAX_UPLOAD_MB * 1024 * 1024 + 1)
    if len(contents) > settings.MAX_UPLOAD_MB * 1024 * 1024:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"File exceeds {settings.MAX_UPLOAD_MB}MB limit")

    ext = content_type.split("/")[-1]
    os.makedirs(os.path.join(settings.UPLOAD_DIR, "voice"), exist_ok=True)
    filename = f"{uuid.uuid4().hex}.{ext}"
    path = os.path.join(settings.UPLOAD_DIR, "voice", filename)
    with open(path, "wb") as f:
        f.write(contents)

    message = Message(
        conversation_id=conversation_id,
        sender_id=user.id,
        type=MessageType.VOICE,
        content_url=f"/uploads/voice/{filename}",
    )
    db.add(message)
    db.commit()
    db.refresh(message)

    # Push to any connected peer immediately, same as a WS-originated text
    # message -- see app/api/routes/chat_ws.py for the receiving side.
    await manager.broadcast(
        _conversation_room(conversation_id),
        {"type": "chat", "message": MessageOut.model_validate(message).model_dump(mode="json")},
        exclude_user_id=user.id,
    )
    return message
