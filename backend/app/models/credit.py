import enum
from datetime import datetime
from decimal import Decimal

from sqlalchemy import ForeignKey, DateTime, Numeric, CheckConstraint, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.types import str_enum


class CreditType(str, enum.Enum):
    EARNED = "earned"
    SPENT = "spent"
    REFUNDED = "refunded"
    # A one-time starting grant on account creation (see
    # app/services/credits.py:grant_signup_bonus) -- kept distinct from
    # EARNED so the ledger honestly records *why* the credit exists: it
    # wasn't paid for by teaching a session. This supersedes the original
    # spec's "no starting bonus" rule, per explicit product decision.
    BONUS = "bonus"
    # A manual admin correction (e.g. "no-show, credit refunded to
    # learner") -- the honest fix for v1 having no automated dispute
    # engine: a human reviews a Report and adjusts the ledger by hand,
    # with the reason logged on the row (see CreditTransaction.reason),
    # rather than the balance silently changing with no record of why.
    ADJUSTMENT = "adjustment"


class CreditStatus(str, enum.Enum):
    PENDING = "pending"
    AVAILABLE = "available"
    SPENT = "spent"
    REFUNDED = "refunded"


class CreditTransaction(Base):
    """
    Immutable ledger row. NEVER updated in place except for the one
    status-only transition performed by the escrow sweep (pending ->
    available) and the spend/refund flows -- the `amount` itself is never
    mutated once written. A user's balance is always SUM(amount) over their
    rows, filtered by status; see app/services/credits.py.
    """
    __tablename__ = "credit_transactions"
    # Every row except 'earned' still holds to the original "+-1, never
    # partial" invariant (bonus/adjustment/refund/spend are always whole,
    # individual rows -- see services/credits.py's docstring convention).
    # 'earned' rows are the one exception: duration-based partial credit
    # (see earn_pending_credit) means a teacher's payout for a session that
    # ran short is a single fractional row in (0, 1], not a whole number.
    __table_args__ = (
        CheckConstraint(
            "(type = 'earned' AND amount > 0 AND amount <= 1) OR (type <> 'earned' AND amount IN (1, -1))",
            name="ck_credit_amount_range",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    # Numeric(4,3): three decimal places is enough precision for a fraction
    # of an hour-scale session, capped at 1.000. Everything but 'earned'
    # rows still only ever stores exactly 1 or -1 (see the CheckConstraint
    # above) -- this widened type exists for 'earned' rows, not because
    # spend/bonus/adjustment/refund became fractional too.
    amount: Mapped[Decimal] = mapped_column(Numeric(4, 3), nullable=False)
    type: Mapped[CreditType] = mapped_column(str_enum(CreditType, "credit_type"), nullable=False)
    session_id: Mapped[int | None] = mapped_column(ForeignKey("sessions.id"), nullable=True, index=True)
    status: Mapped[CreditStatus] = mapped_column(str_enum(CreditStatus, "credit_status"), nullable=False, index=True)
    # Escrow release time for 'earned' rows: now() + 24h at creation. Null
    # for 'spent' rows, which are never pending.
    available_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    # Only ever set on ADJUSTMENT rows -- an admin's stated reason for a
    # manual correction (e.g. "no-show, credit refunded to learner"), so
    # the ledger never has an unexplained balance change.
    reason: Mapped[str | None] = mapped_column(String(280), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship(back_populates="credit_transactions")  # noqa: F821
    session: Mapped["Session"] = relationship(back_populates="credit_transactions")  # noqa: F821
