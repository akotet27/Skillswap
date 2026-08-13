from datetime import datetime

from sqlalchemy import String, DateTime, SmallInteger, CheckConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class User(Base):
    __tablename__ = "users"
    __table_args__ = (CheckConstraint("age IS NULL OR (age >= 18 AND age <= 130)", name="ck_user_age_range"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    # Nullable: a Google-only account never sets a password. A local account
    # nulls this out never -- it's set at signup and only ever replaced.
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    google_id: Mapped[str | None] = mapped_column(String(64), unique=True, index=True, nullable=True)

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    username: Mapped[str | None] = mapped_column(String(80), unique=True, index=True, nullable=True)
    photo_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    bio: Mapped[str | None] = mapped_column(String(280), nullable=True)
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="UTC")
    # Nullable: collected during the post-signup onboarding step, not at
    # signup itself -- existing accounts (and anyone who skips onboarding)
    # simply have no value here. 18 is a real policy floor -- SkillSwap
    # pairs strangers for 1:1 video sessions, so the platform is adults-only
    # (see ck_user_age_range; raised from a 13-floor "garbage input" check
    # once that distinction was pointed out).
    age: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)

    is_email_verified: Mapped[bool] = mapped_column(default=False, nullable=False)
    is_admin: Mapped[bool] = mapped_column(default=False, nullable=False)

    # TOTP 2FA (Phase 1). Secret is only meaningful once totp_enabled=True;
    # it's generated and shown to the user (as a QR code) before they
    # confirm enrollment, so it exists prior to being "active".
    totp_secret: Mapped[str | None] = mapped_column(String(64), nullable=True)
    totp_enabled: Mapped[bool] = mapped_column(default=False, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    skills: Mapped[list["UserSkill"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    availability_blocks: Mapped[list["Availability"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    refresh_tokens: Mapped[list["RefreshToken"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    otp_codes: Mapped[list["OtpCode"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    credit_transactions: Mapped[list["CreditTransaction"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class LoginAudit(Base):
    """
    Cross-cutting requirement #19: a simple login/session audit log for the
    admin view. One row per login attempt (success or failure) -- kept
    separate from RefreshToken because it's an append-only audit trail, not
    an active-session table.
    """
    __tablename__ = "login_audits"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(nullable=True, index=True)  # null if email not found
    email_attempted: Mapped[str] = mapped_column(String(255), nullable=False)
    success: Mapped[bool] = mapped_column(nullable=False)
    ip_address: Mapped[str] = mapped_column(String(64), nullable=False)
    user_agent: Mapped[str] = mapped_column(String(512), nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
