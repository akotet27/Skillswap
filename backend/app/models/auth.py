import enum
from datetime import datetime

from sqlalchemy import ForeignKey, String, DateTime, Boolean, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.types import str_enum


class RefreshToken(Base):
    """
    We never store the raw refresh token, only a hash of it (same idea as a
    password) -- if the DB leaks, stored tokens can't be replayed. Rotation:
    every /auth/refresh call revokes the presented token and issues a new
    row. If a *revoked* token is presented again, that's a reuse signal
    (someone has a stolen copy) and the whole chain is revoked -- see
    app/api/routes/auth.py.
    """
    __tablename__ = "refresh_tokens"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    token_hash: Mapped[str] = mapped_column(String(128), unique=True, index=True, nullable=False)
    # Points at the token this one replaced, so a whole rotation chain can
    # be revoked in one query when reuse of a revoked token is detected.
    replaces_id: Mapped[int | None] = mapped_column(ForeignKey("refresh_tokens.id"), nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship(back_populates="refresh_tokens")  # noqa: F821


class OtpPurpose(str, enum.Enum):
    SIGNUP_VERIFY = "signup_verify"
    PASSWORD_RESET = "password_reset"
    TWO_FA = "2fa"


class OtpCode(Base):
    """
    Alphanumeric one-time codes (CSPRNG-generated, see app/core/security.py),
    stored hashed like a password. Covers signup email verification,
    password-reset links, and login-time 2FA challenges via one table
    distinguished by `purpose`.
    """
    __tablename__ = "otp_codes"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    code_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    purpose: Mapped[OtpPurpose] = mapped_column(str_enum(OtpPurpose, "otp_purpose"), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship(back_populates="otp_codes")  # noqa: F821
