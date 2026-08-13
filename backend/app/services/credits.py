"""
Credit/escrow business logic (Phase 5). This is the one module that's
allowed to write CreditTransaction rows -- routes and tasks call into here
rather than constructing rows themselves, so the state machine in the spec
stays enforced in exactly one place.

State machine (see CLAUDE_CODE_PROMPT.md, Phase 5):
  1. Session -> 'completed'
  2. earn_pending_credit(): +1 'earned' 'pending', available_at = now()+24h
  3. release_available_credits() [hourly Celery Beat task]: pending -> available
  4. balance = SUM(amount) WHERE status IN ('available', 'spent')
  5. spend_credit() at booking time: -1 'spent' 'spent', requires balance >= 1
"""
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session as DbSession

from app.models.credit import CreditTransaction, CreditType, CreditStatus

ESCROW_HOLD_HOURS = 24


def get_balance(db: DbSession, user_id: int) -> int:
    """Spendable balance: available credits not yet spent, plus rows already
    marked spent (so a completed spend doesn't change the historical total
    the SUM represents) minus refunds handled via their own 'refunded' rows.
    Net effect: SUM over every non-pending row is exactly the ledger's
    truth, which is what "spendable balance" means here."""
    total = db.scalar(
        select(func.coalesce(func.sum(CreditTransaction.amount), 0)).where(
            CreditTransaction.user_id == user_id,
            CreditTransaction.status.in_(
                [CreditStatus.AVAILABLE, CreditStatus.SPENT]),
        )
    )
    return int(total or 0)


def earn_pending_credit(db: DbSession, user_id: int, session_id: int) -> CreditTransaction:
    """Step 2: teacher earns a credit held in escrow for 24h after a session
    completes. Guests never call this -- only the SessionParticipant with
    role='teacher' does (enforced by the caller)."""
    now = datetime.now(timezone.utc)
    txn = CreditTransaction(
        user_id=user_id,
        amount=1,
        type=CreditType.EARNED,
        session_id=session_id,
        status=CreditStatus.PENDING,
        available_at=now + timedelta(hours=ESCROW_HOLD_HOURS),
    )
    db.add(txn)
    db.flush()
    return txn


SIGNUP_BONUS_CREDITS = 3


def grant_signup_bonus(db: DbSession, user_id: int) -> None:
    """Called exactly once, right after a new account is created (see
    app/api/routes/auth.py's verify_signup_otp and google_callback) --
    SIGNUP_BONUS_CREDITS individual +1 rows (never a single row of a
    bigger amount: the ledger's own CheckConstraint restricts every row to
    exactly +-1, so "3 credits" is always 3 rows). Available immediately,
    not held pending -- there's no session to build trust around yet, so
    the 24h escrow hold earn_pending_credit() uses doesn't apply here.

    This is a deliberate reversal of the original spec's "no starting
    bonus" rule (see README's documented v1 cold-start gap) -- product
    decision, not a bug fix."""
    for _ in range(SIGNUP_BONUS_CREDITS):
        db.add(CreditTransaction(user_id=user_id, amount=1,
               type=CreditType.BONUS, status=CreditStatus.AVAILABLE))
    db.flush()


def release_available_credits(db: DbSession) -> int:
    """Step 3: sweep pending rows whose hold has expired. Returns count
    flipped. Called hourly by Celery Beat (app/tasks/credit_tasks.py)."""
    now = datetime.now(timezone.utc)
    rows = db.scalars(
        select(CreditTransaction).where(
            CreditTransaction.status == CreditStatus.PENDING,
            CreditTransaction.available_at <= now,
        )
    ).all()
    for row in rows:
        row.status = CreditStatus.AVAILABLE
    db.flush()
    return len(rows)


class InsufficientCreditsError(Exception):
    pass


def spend_credit(db: DbSession, user_id: int, session_id: int) -> CreditTransaction:
    """Step 5: called at booking confirmation for the learner side. v1 has
    no partial credits and no starting bonus -- a brand-new user must teach
    before they can learn (balance starts at 0)."""
    if get_balance(db, user_id) < 1:
        raise InsufficientCreditsError(
            "Not enough credits to book this session")
    txn = CreditTransaction(
        user_id=user_id,
        amount=-1,
        type=CreditType.SPENT,
        session_id=session_id,
        status=CreditStatus.SPENT,
        available_at=None,
    )
    db.add(txn)
    db.flush()
    return txn


def refund_credit(db: DbSession, user_id: int, session_id: int) -> CreditTransaction:
    """Used on cancellation of a session the learner already paid for. The
    ledger is immutable -- we never rewrite the original 'spent' row --
    so a refund is a new +1 row. Status is 'available' (not 'refunded')
    on purpose: the balance formula in the spec sums status IN
    ('available', 'spent'), and a refunded credit should be immediately
    spendable again with no re-triggered 24h escrow hold (it was never
    earned via a fresh completed session). `type='refunded'` still records
    *why* the row exists, for the user's transaction history view."""
    txn = CreditTransaction(
        user_id=user_id,
        amount=1,
        type=CreditType.REFUNDED,
        session_id=session_id,
        status=CreditStatus.AVAILABLE,
        available_at=None,
    )
    db.add(txn)
    db.flush()
    return txn
