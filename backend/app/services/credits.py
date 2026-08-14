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
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session as DbSession

from app.models.credit import CreditTransaction, CreditType, CreditStatus

ESCROW_HOLD_HOURS = 24

# Duration-based partial credit (see services/attendance.py for the
# join/leave tracking this is computed from): a session the teacher barely
# showed up to shouldn't pay out a full credit, but a few seconds of a
# dropped connection right at the start shouldn't zero it out either --
# 5 connected minutes is the floor below which nothing was really taught.
MIN_CREDIT_MINUTES = 5


def get_balance(db: DbSession, user_id: int) -> float:
    """Spendable balance: available credits not yet spent, plus rows already
    marked spent (so a completed spend doesn't change the historical total
    the SUM represents) minus refunds handled via their own 'refunded' rows.
    Net effect: SUM over every non-pending row is exactly the ledger's
    truth, which is what "spendable balance" means here. A float, not an
    int, since 'earned' rows can be fractional (duration-based credit)."""
    total = db.scalar(
        select(func.coalesce(func.sum(CreditTransaction.amount), 0)).where(
            CreditTransaction.user_id == user_id,
            CreditTransaction.status.in_(
                [CreditStatus.AVAILABLE, CreditStatus.SPENT]),
        )
    )
    return round(float(total or 0), 3)


def get_pending_balance(db: DbSession, user_id: int) -> float:
    """Credits earned from teaching but still inside the 24h escrow hold."""
    total = db.scalar(
        select(func.coalesce(func.sum(CreditTransaction.amount), 0)).where(
            CreditTransaction.user_id == user_id,
            CreditTransaction.status == CreditStatus.PENDING,
        )
    )
    return round(float(total or 0), 3)


def compute_earned_amount(connected_minutes: float, scheduled_minutes: float) -> Decimal:
    """connected_minutes / scheduled_minutes, capped at 1.0 -- a session
    that ran the full scheduled length (or over) earns a full credit,
    one that the teacher left early earns a fraction of it. Below
    MIN_CREDIT_MINUTES connected, returns 0 (no real teaching happened --
    see earn_pending_credit, which skips creating a row entirely at 0)."""
    if connected_minutes < MIN_CREDIT_MINUTES:
        return Decimal("0")
    if scheduled_minutes <= 0:
        # Shouldn't happen (booking always validates end > start), but
        # don't divide by zero -- if they were connected at all past the
        # floor above, treat it as a full credit rather than erroring.
        return Decimal("1")
    fraction = min(1.0, connected_minutes / scheduled_minutes)
    return Decimal(str(fraction)).quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)


def earn_pending_credit(db: DbSession, user_id: int, session_id: int, amount: Decimal) -> CreditTransaction | None:
    """Step 2: teacher earns a (possibly partial, see compute_earned_amount)
    credit held in escrow for 24h after a session completes. Guests never
    call this -- only the SessionParticipant with role='teacher' does
    (enforced by the caller). Returns None and creates no row at all for
    amount <= 0 -- a zero-credit row would violate the ledger's own
    CheckConstraint (which requires 'earned' rows to be > 0) and would just
    be noise anyway."""
    if amount <= 0:
        return None
    now = datetime.now(timezone.utc)
    txn = CreditTransaction(
        user_id=user_id,
        amount=amount,
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


def apply_admin_adjustment(db: DbSession, user_id: int, amount: int, reason: str) -> list[CreditTransaction]:
    """Manual correction by an admin (e.g. resolving a Report) -- the
    honest fix for v1 having no automated dispute engine: a human adjusts
    the ledger by hand, with `reason` always recorded so the balance
    change is never unexplained. `amount` can be any non-zero int (the
    caller-facing unit is "credits", not "rows"), but every row the
    ledger's own CheckConstraint allows is still exactly +-1 -- same
    "individual rows, never one row of amount N" convention as
    grant_signup_bonus. Available immediately, no escrow hold (this
    isn't earned by teaching, so the 24h trust-building hold doesn't
    apply)."""
    sign = 1 if amount > 0 else -1
    rows = []
    for _ in range(abs(amount)):
        txn = CreditTransaction(
            user_id=user_id, amount=sign, type=CreditType.ADJUSTMENT, status=CreditStatus.AVAILABLE, reason=reason
        )
        db.add(txn)
        rows.append(txn)
    db.flush()
    return rows


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
