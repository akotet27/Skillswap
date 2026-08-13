"""
Token issuance/rotation and OTP lifecycle -- kept out of the route module so
app/api/routes/auth.py stays a thin HTTP layer over this.

Refresh token rotation & reuse detection (cross-cutting requirement #2):
every refresh call revokes the presented row and inserts a new one with
`replaces_id` pointing back at it, forming a chain. If a *revoked* token is
presented again, that can only mean a copy of it leaked (the legitimate
client already moved on to the token that replaced it) -- so we walk back
through `replaces_id` and revoke the entire chain, forcing a fresh login.
"""
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.core.config import settings
from app.core.security import create_access_token, generate_opaque_token, hash_token
from app.models.auth import RefreshToken
from app.models.user import User


class RefreshTokenReuseError(Exception):
    """Raised when a revoked refresh token is presented again -- signal of theft."""


class InvalidRefreshTokenError(Exception):
    pass


def issue_token_pair(db: DbSession, user: User) -> tuple[str, str]:
    access = create_access_token(user.id)
    raw_refresh = generate_opaque_token()
    row = RefreshToken(
        user_id=user.id,
        token_hash=hash_token(raw_refresh),
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
    )
    db.add(row)
    db.flush()
    return access, raw_refresh


def _revoke_chain(db: DbSession, start: RefreshToken) -> None:
    """Revoke `start` and walk forward/backward through the replaces_id
    chain, revoking every token that was ever part of this lineage."""
    # Revoke everything that shares this user -- simplest correct
    # over-approximation for v1 (a user has few concurrent chains in
    # practice); avoids recursive CTE complexity for a security fallback
    # path that should rarely trigger.
    db.query(RefreshToken).filter(RefreshToken.user_id == start.user_id, RefreshToken.revoked == False).update(  # noqa: E712
        {"revoked": True}
    )


def rotate_refresh_token(db: DbSession, raw_token: str) -> tuple[str, str, User]:
    token_hash = hash_token(raw_token)
    row = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == token_hash))
    if row is None:
        raise InvalidRefreshTokenError()

    if row.revoked:
        _revoke_chain(db, row)
        db.flush()
        raise RefreshTokenReuseError()

    if row.expires_at < datetime.now(timezone.utc):
        raise InvalidRefreshTokenError()

    user = db.get(User, row.user_id)
    if user is None:
        raise InvalidRefreshTokenError()

    row.revoked = True
    access = create_access_token(user.id)
    raw_new = generate_opaque_token()
    new_row = RefreshToken(
        user_id=user.id,
        token_hash=hash_token(raw_new),
        replaces_id=row.id,
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
    )
    db.add(new_row)
    db.flush()
    return access, raw_new, user


def revoke_refresh_token(db: DbSession, raw_token: str) -> None:
    row = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == hash_token(raw_token)))
    if row is not None:
        row.revoked = True
        db.flush()


# Signup-verification OTPs no longer live here -- see
# app/services/pending_signup.py, which stores them in Redis alongside
# the not-yet-created account rather than in the OtpCode table. The
# OtpCode table (and OtpPurpose.PASSWORD_RESET) is still used directly by
# the password-reset flow in app/api/routes/auth.py, which by definition
# always has a real, already-verified User to attach the row to.
