from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.models.report import ReportStatus
from app.schemas.user import UserOut


class ReportCreate(BaseModel):
    reason: str = Field(min_length=1, max_length=100)
    note: str | None = Field(default=None, max_length=2000)


class ReportOut(BaseModel):
    id: int
    session_id: int
    reporter: UserOut
    reported_user: UserOut
    reason: str
    note: str | None
    status: ReportStatus
    created_at: datetime

    class Config:
        from_attributes = True


class CreditAdjustmentRequest(BaseModel):
    amount: int = Field(description="Positive to grant credits, negative to remove them. Never 0.")
    reason: str = Field(min_length=1, max_length=280)

    @field_validator("amount")
    @classmethod
    def _amount_not_zero(cls, v: int) -> int:
        if v == 0:
            raise ValueError("amount can't be 0")
        return v
