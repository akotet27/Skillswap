"""
Read-only credit balance/history view. Pulled forward from Phase 5 (whose
scope is really the escrow *sweep* and session-completion crediting) so
the Phase 2 booking UI has something to show the user when a booking is
rejected with 402 Payment Required -- "why" matters as much as "that it
failed". Writes to the ledger still only ever happen via
app/services/credits.py, called from booking/session-completion flows,
never from this router.
"""
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.credit import CreditTransaction
from app.models.user import User
from app.schemas.credit import CreditSummaryOut
from app.services.credits import get_balance, get_pending_balance

router = APIRouter(prefix="/api/credits", tags=["credits"])


@router.get("/me", response_model=CreditSummaryOut)
def my_credit_summary(user: User = Depends(get_current_user), db: DbSession = Depends(get_db)):
    txns = db.scalars(
        select(CreditTransaction).where(CreditTransaction.user_id == user.id).order_by(CreditTransaction.created_at.desc())
    ).all()
    return CreditSummaryOut(balance=get_balance(db, user.id), pending_balance=get_pending_balance(db, user.id), transactions=txns)
