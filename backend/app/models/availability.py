from sqlalchemy import ForeignKey, SmallInteger, Time, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Availability(Base):
    """
    A recurring weekly time block, e.g. "Mondays 18:00-19:30 Africa/Kigali".
    Stored per-user in the user's own timezone; the matching algorithm
    converts to UTC when computing overlap between two users in different
    timezones (see app/services/matching.py).
    """
    __tablename__ = "availability_blocks"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    day_of_week: Mapped[int] = mapped_column(SmallInteger, nullable=False)  # 0=Monday .. 6=Sunday (ISO)
    start_time: Mapped[str] = mapped_column(Time, nullable=False)
    end_time: Mapped[str] = mapped_column(Time, nullable=False)
    timezone: Mapped[str] = mapped_column(String(64), nullable=False)

    user: Mapped["User"] = relationship(back_populates="availability_blocks")  # noqa: F821
