from datetime import datetime

from pydantic import BaseModel

from app.models.credit import CreditType, CreditStatus


class CreditTransactionOut(BaseModel):
    id: int
    amount: int
    type: CreditType
    status: CreditStatus
    session_id: int | None
    available_at: datetime | None
    created_at: datetime

    class Config:
        from_attributes = True


class CreditSummaryOut(BaseModel):
    balance: int
    transactions: list[CreditTransactionOut]
