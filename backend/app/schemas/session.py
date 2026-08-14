from datetime import datetime

from pydantic import BaseModel, model_validator

from app.models.session import SessionStatus, ParticipantRole
from app.models.swap_request import SwapRequestStatus
from app.schemas.user import SkillOut, UserOut


class SwapRequestCreate(BaseModel):
    recipient_id: int
    skill_taught_id: int  # the skill I (requester) offer, informational for this swap relationship
    skill_learned_id: int  # the skill recipient will teach me in the resulting session
    proposed_start_utc: datetime
    proposed_end_utc: datetime

    @model_validator(mode="after")
    def check_time_order(self):
        if self.proposed_end_utc <= self.proposed_start_utc:
            raise ValueError("proposed_end_utc must be after proposed_start_utc")
        return self


class SwapRequestOut(BaseModel):
    id: int
    requester_id: int
    recipient_id: int
    skill_taught: SkillOut
    skill_learned: SkillOut
    status: SwapRequestStatus
    proposed_start_utc: datetime
    proposed_end_utc: datetime
    created_at: datetime

    class Config:
        from_attributes = True


class SessionParticipantOut(BaseModel):
    user: UserOut
    role: ParticipantRole

    class Config:
        from_attributes = True


class SessionOut(BaseModel):
    id: int
    request_id: int | None
    scheduled_start_utc: datetime
    scheduled_end_utc: datetime
    status: SessionStatus
    video_room_id: str
    is_group: bool
    max_participants: int
    participants: list[SessionParticipantOut]
    # The skill being taught in this session -- see Session.skill in
    # models/session.py. None only for a session with no originating
    # SwapRequest, which the normal booking flow never actually produces.
    skill: SkillOut | None = None

    class Config:
        from_attributes = True
