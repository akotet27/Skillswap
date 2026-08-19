import enum
from datetime import datetime

from sqlalchemy import ForeignKey, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.types import str_enum


class SwapRequestStatus(str, enum.Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    DECLINED = "declined"


class SwapRequest(Base):
    __tablename__ = "swap_requests"

    id: Mapped[int] = mapped_column(primary_key=True)
    requester_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    recipient_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    skill_taught_id: Mapped[int] = mapped_column(ForeignKey("skills.id"), nullable=False)
    skill_learned_id: Mapped[int] = mapped_column(ForeignKey("skills.id"), nullable=False)
    status: Mapped[SwapRequestStatus] = mapped_column(
        str_enum(SwapRequestStatus, "swap_request_status"), default=SwapRequestStatus.PENDING, nullable=False
    )
    # The slot the requester proposed when sending the request; becomes the
    # Session's scheduled time on acceptance.
    proposed_start_utc: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    proposed_end_utc: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    sessions: Mapped[list["Session"]] = relationship(back_populates="request")  # noqa: F821
    # foreign_keys= is required on both: SQLAlchemy can't infer which FK a
    # relationship means when two columns here point at the same table
    # (skills, or users below). Required by SwapRequestOut (schemas/session.py),
    # which nests full SkillOut/UserBriefOut objects, not just the raw ids.
    skill_taught: Mapped["Skill"] = relationship(foreign_keys=[skill_taught_id])  # noqa: F821
    skill_learned: Mapped["Skill"] = relationship(foreign_keys=[skill_learned_id])  # noqa: F821
    requester: Mapped["User"] = relationship(foreign_keys=[requester_id])  # noqa: F821
    recipient: Mapped["User"] = relationship(foreign_keys=[recipient_id])  # noqa: F821
