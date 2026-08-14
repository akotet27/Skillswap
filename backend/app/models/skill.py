import enum
from datetime import datetime

from sqlalchemy import String, ForeignKey, UniqueConstraint, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.types import str_enum


class Skill(Base):
    __tablename__ = "skills"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    category: Mapped[str] = mapped_column(String(60), index=True, nullable=False)

    user_links: Mapped[list["UserSkill"]] = relationship(back_populates="skill", cascade="all, delete-orphan")


class SkillType(str, enum.Enum):
    HAVE = "have"
    WANT = "want"


class SkillWaitlist(Base):
    """"Notify me" for a skill nobody currently teaches -- surfaced on the
    profile editor next to a 'want' tag that has no matching teacher (see
    app/api/routes/skills.py's has_teacher() check). A daily Celery Beat
    task (app/tasks/waitlist_tasks.py) sweeps unnotified rows and emails
    anyone whose skill has since gained a teacher; `notified_at` being set
    is what makes a row "done" -- rows aren't deleted so there's a record
    of who was notified and when."""
    __tablename__ = "skill_waitlist"
    __table_args__ = (UniqueConstraint("user_id", "skill_id", name="uq_skill_waitlist_once_per_skill"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    skill_id: Mapped[int] = mapped_column(ForeignKey("skills.id", ondelete="CASCADE"), index=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    notified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped["User"] = relationship()  # noqa: F821
    skill: Mapped["Skill"] = relationship()


class UserSkill(Base):
    """
    Join table between User and Skill, tagged 'have' (I can teach this) or
    'want' (I want to learn this). The matching algorithm (Phase 2) joins
    this table against itself across two users to find mutual complements.
    """
    __tablename__ = "user_skills"
    __table_args__ = (UniqueConstraint("user_id", "skill_id", "type", name="uq_user_skill_type"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    skill_id: Mapped[int] = mapped_column(ForeignKey("skills.id", ondelete="CASCADE"), index=True, nullable=False)
    type: Mapped[SkillType] = mapped_column(str_enum(SkillType, "skill_type"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship(back_populates="skills")  # noqa: F821
    skill: Mapped["Skill"] = relationship(back_populates="user_links")
