"""User-reports moderation queue -- the "honest fix" for v1 not having
automated dispute resolution: a human (admin) reviews reports and acts on
them manually (suspend, credit adjustment), rather than pretending v1 has
a dispute engine it doesn't."""
import enum
from datetime import datetime

from sqlalchemy import ForeignKey, DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.types import str_enum


class ReportStatus(str, enum.Enum):
    OPEN = "open"
    RESOLVED = "resolved"


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Tied to the session it happened in -- reports aren't free-floating
    # complaints, they're scoped to a specific swap the reporter was
    # actually part of (enforced in the route, not the schema).
    session_id: Mapped[int] = mapped_column(ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    reporter_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    reported_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    reason: Mapped[str] = mapped_column(String(100), nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[ReportStatus] = mapped_column(
        str_enum(ReportStatus, "report_status"), default=ReportStatus.OPEN, nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)

    session: Mapped["Session"] = relationship()  # noqa: F821
    reporter: Mapped["User"] = relationship(foreign_keys=[reporter_id])  # noqa: F821
    reported_user: Mapped["User"] = relationship(foreign_keys=[reported_user_id])  # noqa: F821
