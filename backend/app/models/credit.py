import enum
from datetime import datetime

from sqlalchemy import ForeignKey, DateTime, Integer, CheckConstraint, func
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
    __table_args__ = (CheckConstraint("amount IN (1, -1)", name="ck_credit_amount_unit"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)  # +1 or -1 only in v1, no partial credits
    type: Mapped[CreditType] = mapped_column(str_enum(CreditType, "credit_type"), nullable=False)
    session_id: Mapped[int | None] = mapped_column(ForeignKey("sessions.id"), nullable=True, index=True)
    status: Mapped[CreditStatus] = mapped_column(str_enum(CreditStatus, "credit_status"), nullable=False, index=True)
    # Escrow release time for 'earned' rows: now() + 24h at creation. Null
    # for 'spent' rows, which are never pending.
    available_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship(back_populates="credit_transactions")  # noqa: F821
    session: Mapped["Session"] = relationship(back_populates="credit_transactions")  # noqa: F821
