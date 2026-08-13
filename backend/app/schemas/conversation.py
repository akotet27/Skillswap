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
    created_at: datetime

    class Config:
        from_attributes = True


class ConversationCreate(BaseModel):
    other_user_id: int


class ConversationOut(BaseModel):
    id: int
    other_user: UserOut
    last_message: MessageOut | None
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
