from datetime import datetime

from pydantic import BaseModel

from app.models.credit import CreditType, CreditStatus


class CreditTransactionOut(BaseModel):
    id: int
    # float, not int: 'earned' rows can be fractional now (duration-based
    # partial credit -- see services/credits.py:compute_earned_amount).
    # Every other type still only ever holds exactly 1 or -1.
    amount: float
    type: CreditType
    status: CreditStatus
    session_id: int | None
    available_at: datetime | None
    created_at: datetime

    class Config:
        from_attributes = True


class CreditSummaryOut(BaseModel):
    balance: float
    pending_balance: float
    transactions: list[CreditTransactionOut]
