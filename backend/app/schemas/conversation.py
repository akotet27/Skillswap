from datetime import datetime

from pydantic import BaseModel

from app.models.messaging import MessageType
from app.schemas.user import UserOut


class MessageOut(BaseModel):
    id: int
    conversation_id: int
    sender_id: int
    type: MessageType
    content: str | None
    content_url: str | None
    # E2E encrypted chat: set means `content` is base64 AES-GCM ciphertext
    # the client must decrypt (see frontend/src/crypto/e2e.js); null means
    # `content` is plain text as before (legacy message, or sent before
    # either side had a public key on file).
    iv: str | None
    # Only meaningful for type == "file" -- see Message.file_* in
    # models/messaging.py.
    file_name: str | None = None
    file_size: int | None = None
    file_mime: str | None = None
    edited_at: datetime | None = None
    deleted_at: datetime | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class ConversationCreate(BaseModel):
    other_user_id: int


class ConversationOut(BaseModel):
    id: int
    other_user: UserOut
    last_message: MessageOut | None
    unread_count: int = 0
    created_at: datetime


class UpcomingSessionOut(BaseModel):
    id: int
    scheduled_start_utc: datetime
    scheduled_end_utc: datetime
    status: str
    video_room_id: str
    # Client computes "join is active" as now >= scheduled_start_utc -
    # join_active_lead_minutes, but the server tells it the threshold so
    # the rule lives in one place.
    join_active_lead_minutes: int = 5
