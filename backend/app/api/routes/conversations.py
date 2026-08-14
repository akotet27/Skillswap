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
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from pydantic import BaseModel, Field
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


def _notification_room(user_id: int) -> str:
    # A second namespace in the same shared ConnectionManager (not a
    # second notification system) -- every authenticated page keeps one
    # of these open (see AppSidebar.jsx -> useNotifications), so a
    # message can reach someone regardless of which page they're on,
    # unlike _conversation_room which only reaches people with that
    # specific conversation open.
    return f"user:{user_id}"


async def _notify_new_message(db: DbSession, conversation_id: int, sender: User, recipient_id: int, preview: str) -> None:
    await manager.broadcast(
        _notification_room(recipient_id),
        {
            "type": "new-message-notification",
            "conversation_id": conversation_id,
            "sender_name": sender.name,
            "preview": preview,
            "unread_total": conv_service.total_unread(db, recipient_id),
        },
    )


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
    return ConversationOut(
        id=conv.id, other_user=other, last_message=conv_service.last_message(db, conv.id),
        unread_count=conv_service.unread_count(db, conv.id, user.id), created_at=conv.created_at,
    )


@router.get("", response_model=list[ConversationOut])
def list_conversations(user: User = Depends(get_current_user), db: DbSession = Depends(get_db)):
    convs = conv_service.list_conversations_for_user(db, user.id)
    out = []
    for conv in convs:
        other_id = conv_service.other_participant_id(db, conv.id, user.id)
        other = db.get(User, other_id) if other_id else None
        if other is None:
            continue
        out.append(ConversationOut(
            id=conv.id, other_user=other, last_message=conv_service.last_message(db, conv.id),
            unread_count=conv_service.unread_count(db, conv.id, user.id), created_at=conv.created_at,
        ))
    out.sort(key=lambda c: c.last_message.created_at if c.last_message else c.created_at, reverse=True)
    return out


# NOTE: /unread-count must be registered before /{conversation_id} -- see
# the identical reasoning at /me/skills vs /{user_id}/skills in
# app/api/routes/users.py. "unread-count" is a syntactically valid match
# for {conversation_id} and would 422 trying to parse it as an int if the
# dynamic route were registered first.
@router.get("/unread-count")
def get_total_unread(user: User = Depends(get_current_user), db: DbSession = Depends(get_db)):
    """Lightweight endpoint for the sidebar badge's initial value (the WS
    push keeps it live after that) -- avoids fetching the full
    conversation list just to sum unread counts."""
    return {"unread_total": conv_service.total_unread(db, user.id)}


@router.get("/{conversation_id}", response_model=ConversationOut)
def get_conversation(conversation_id: int, user: User = Depends(get_current_user), db: DbSession = Depends(get_db)):
    try:
        conv = conv_service.assert_participant(db, conversation_id, user.id)
    except conv_service.NotAParticipantError as e:
        raise HTTPException(status.HTTP_403_FORBIDDEN, str(e))
    other_id = conv_service.other_participant_id(db, conv.id, user.id)
    other = db.get(User, other_id) if other_id else None
    return ConversationOut(
        id=conv.id, other_user=other, last_message=conv_service.last_message(db, conv.id),
        unread_count=conv_service.unread_count(db, conv.id, user.id), created_at=conv.created_at,
    )


@router.post("/{conversation_id}/read", status_code=status.HTTP_204_NO_CONTENT)
def mark_conversation_read(conversation_id: int, user: User = Depends(get_current_user), db: DbSession = Depends(get_db)):
    try:
        conv_service.assert_participant(db, conversation_id, user.id)
    except conv_service.NotAParticipantError as e:
        raise HTTPException(status.HTTP_403_FORBIDDEN, str(e))
    conv_service.mark_read(db, conversation_id, user.id)


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

    other_id = conv_service.other_participant_id(db, conversation_id, user.id)
    if other_id is not None:
        await _notify_new_message(db, conversation_id, user, other_id, "Voice note")
    return message


# A deliberately broad allow-list (unlike voice, which only ever sees a
# handful of audio/* mimetypes from MediaRecorder) -- this is a general
# "send a file" attachment, not a specific media type. Still capped by
# extension/mimetype at all, rather than accepting literally anything, to
# keep obviously-wrong uploads (executables, etc.) out.
_ALLOWED_FILE_MIMES = {
    "image/jpeg", "image/png", "image/webp", "image/gif",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain", "text/csv",
    "application/zip",
}


@router.post("/{conversation_id}/messages/file", response_model=MessageOut, status_code=status.HTTP_201_CREATED)
async def upload_file_message(
    conversation_id: int,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
):
    """A generic file attachment -- same broadcast/notify path as a voice
    note (see upload_voice_note above), just a different type and with
    filename/size/mime kept for the chat UI's preview chip. Not
    end-to-end encrypted (unlike text messages) -- v1 scope limit, same
    as voice notes; the file itself sits on this server same as an avatar
    or voice-note upload."""
    try:
        conv_service.assert_participant(db, conversation_id, user.id)
    except conv_service.NotAParticipantError as e:
        raise HTTPException(status.HTTP_403_FORBIDDEN, str(e))

    content_type = (file.content_type or "").split(";", 1)[0].strip()
    if content_type not in _ALLOWED_FILE_MIMES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unsupported file type: {file.content_type or 'unknown'}")

    contents = await file.read(settings.MAX_UPLOAD_MB * 1024 * 1024 + 1)
    if len(contents) > settings.MAX_UPLOAD_MB * 1024 * 1024:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"File exceeds {settings.MAX_UPLOAD_MB}MB limit")

    original_name = file.filename or "file"
    ext = os.path.splitext(original_name)[1][:16]  # keep the real extension so downloads open correctly
    os.makedirs(os.path.join(settings.UPLOAD_DIR, "files"), exist_ok=True)
    stored_name = f"{uuid.uuid4().hex}{ext}"
    path = os.path.join(settings.UPLOAD_DIR, "files", stored_name)
    with open(path, "wb") as f:
        f.write(contents)

    message = Message(
        conversation_id=conversation_id,
        sender_id=user.id,
        type=MessageType.FILE,
        content_url=f"/uploads/files/{stored_name}",
        file_name=original_name[:255],
        file_size=len(contents),
        file_mime=content_type,
    )
    db.add(message)
    db.commit()
    db.refresh(message)

    await manager.broadcast(
        _conversation_room(conversation_id),
        {"type": "chat", "message": MessageOut.model_validate(message).model_dump(mode="json")},
        exclude_user_id=user.id,
    )

    other_id = conv_service.other_participant_id(db, conversation_id, user.id)
    if other_id is not None:
        await _notify_new_message(db, conversation_id, user, other_id, f"📎 {original_name}")
    return message


class MessageEditRequest(BaseModel):
    content: str = Field(min_length=1, max_length=20000)  # generous ceiling: base64 ciphertext is ~33% larger than plaintext
    iv: str | None = None


def _get_own_message_or_404(db: DbSession, conversation_id: int, message_id: int, user_id: int) -> Message:
    message = db.get(Message, message_id)
    if message is None or message.conversation_id != conversation_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Message not found")
    if message.deleted_at is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "This message was deleted")
    if message.sender_id != user_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only edit or delete your own messages")
    return message


@router.patch("/{conversation_id}/messages/{message_id}", response_model=MessageOut)
async def edit_message(
    conversation_id: int, message_id: int, payload: MessageEditRequest,
    user: User = Depends(get_current_user), db: DbSession = Depends(get_db),
):
    """Text messages only -- editing a voice note or file attachment isn't
    a coherent concept, only deleting one is (see delete_message). Same
    re-encrypt-and-replace flow as sending: the client encrypts the new
    text client-side (if it has a shared key) and PATCHes the fresh
    ciphertext+iv -- the server just stores whatever it's given, same as
    at send time."""
    message = _get_own_message_or_404(db, conversation_id, message_id, user.id)
    if message.type != MessageType.TEXT:
        raise HTTPException(status.HTTP_409_CONFLICT, "Only text messages can be edited")

    message.content = payload.content
    message.iv = payload.iv
    message.edited_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(message)

    await manager.broadcast(
        _conversation_room(conversation_id),
        {"type": "message-edited", "message": MessageOut.model_validate(message).model_dump(mode="json")},
    )
    return message


@router.delete("/{conversation_id}/messages/{message_id}", response_model=MessageOut)
async def delete_message(
    conversation_id: int, message_id: int,
    user: User = Depends(get_current_user), db: DbSession = Depends(get_db),
):
    """Soft delete -- the row (and its position in the transcript) stays,
    but content/ciphertext/file are cleared, and the UI renders a "This
    message was deleted" placeholder in its place (see ChatPage.jsx).
    Removes the underlying upload from disk for voice/file messages
    rather than leaving an orphaned file with nothing pointing at it."""
    message = _get_own_message_or_404(db, conversation_id, message_id, user.id)

    if message.content_url:
        path = os.path.join(settings.UPLOAD_DIR, message.content_url.removeprefix("/uploads/"))
        if os.path.exists(path):
            try:
                os.remove(path)
            except OSError:
                pass  # best-effort -- a missing/locked file shouldn't block the delete itself

    message.content = None
    message.content_url = None
    message.iv = None
    message.file_name = None
    message.file_size = None
    message.file_mime = None
    message.deleted_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(message)

    await manager.broadcast(
        _conversation_room(conversation_id),
        {"type": "message-deleted", "message": MessageOut.model_validate(message).model_dump(mode="json")},
    )
    return message
