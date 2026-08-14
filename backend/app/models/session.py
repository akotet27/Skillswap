import enum
import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, DateTime, Boolean, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.types import str_enum


class SessionStatus(str, enum.Enum):
    SCHEDULED = "scheduled"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    NO_SHOW = "no_show"


class ParticipantRole(str, enum.Enum):
    TEACHER = "teacher"
    LEARNER = "learner"
    GUEST = "guest"  # guests never trigger CreditTransaction rows -- see Phase 5


def _new_room_id() -> str:
    return uuid.uuid4().hex


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Nullable: a session can originate from a direct booking against
    # someone's availability, not only from an accepted SwapRequest.
    request_id: Mapped[int | None] = mapped_column(ForeignKey("swap_requests.id"), nullable=True)

    scheduled_start_utc: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    scheduled_end_utc: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[SessionStatus] = mapped_column(
        str_enum(SessionStatus, "session_status"), default=SessionStatus.SCHEDULED, nullable=False
    )
    # Opaque room key used as the WebSocket room ID for both signaling and
    # in-call chat -- never the numeric session id, so a guessed/incremented
    # id can't be used to join someone else's call.
    video_room_id: Mapped[str] = mapped_column(String(64), unique=True, default=_new_room_id, nullable=False)
    is_group: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    max_participants: Mapped[int] = mapped_column(Integer, default=2, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    request: Mapped["SwapRequest"] = relationship(back_populates="sessions")  # noqa: F821
    participants: Mapped[list["SessionParticipant"]] = relationship(back_populates="session", cascade="all, delete-orphan")
    credit_transactions: Mapped[list["CreditTransaction"]] = relationship(back_populates="session")  # noqa: F821
    ratings: Mapped[list["Rating"]] = relationship(back_populates="session", cascade="all, delete-orphan")  # noqa: F821

    @property
    def skill(self):
        """The skill being taught in this session -- from the originating
        SwapRequest's skill_learned_id (what the recipient/teacher agreed
        to teach, see SwapRequest's own field comment). None only for a
        session with no request_id at all, which the normal booking flow
        never actually produces (request_id is nullable in the schema for
        a hypothetical direct-booking path, not because it's ever
        actually null today). Picked up automatically by SessionOut
        (schemas/session.py) via from_attributes -- property name matches
        the schema field name on purpose."""
        return self.request.skill_learned if self.request else None


class SessionParticipant(Base):
    __tablename__ = "session_participants"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("sessions.id", ondelete="CASCADE"), index=True, nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    role: Mapped[ParticipantRole] = mapped_column(str_enum(ParticipantRole, "participant_role"), nullable=False)

    session: Mapped["Session"] = relationship(back_populates="participants")
    # No back_populates on User -- nothing needs a reverse "all my
    # participant rows" collection off User itself, so this stays
    # one-directional. Required by SessionParticipantOut (schemas/session.py),
    # which nests a full UserOut per participant.
    user: Mapped["User"] = relationship()  # noqa: F821


class CallAttendance(Base):
    """One join->leave span in a session's video room, for a real (non-guest)
    participant -- feeds the duration-based partial-credit calculation at
    completion (see services/attendance.py, services/credits.py, and the
    join/disconnect handlers in api/routes/signaling_ws.py). A participant
    can have multiple rows per session if they reconnect; `left_at` is null
    while they're still connected, and force-closed at completion time if
    the socket is still open then (see booking.py:complete_session)."""
    __tablename__ = "call_attendance"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("sessions.id", ondelete="CASCADE"), index=True, nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    left_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
