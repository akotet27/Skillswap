from datetime import datetime

from pydantic import BaseModel

from app.schemas.user import SkillOut


class WaitlistOut(BaseModel):
    id: int
    skill: SkillOut
    created_at: datetime
    notified_at: datetime | None

    class Config:
        from_attributes = True
