from pydantic import BaseModel

from app.schemas.user import UserOut


class MatchOut(BaseModel):
    user: UserOut
    they_teach_you: list[str]
    you_teach_them: list[str]
    overlap_minutes: int
