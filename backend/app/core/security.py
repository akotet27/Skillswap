"""
Password hashing, JWT access tokens, refresh-token opaque secrets, and
CSPRNG alphanumeric OTP codes -- every primitive Phase 1 needs, kept in one
module so there's exactly one place that touches `secrets`/`jose`/`passlib`.
"""
import secrets
import string
from datetime import datetime, timedelta, timezone

from jose import jwt, JWTError
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Excludes visually-ambiguous characters (0/O, 1/I/l) -- these codes are
# read off an email and typed by hand, so avoid transcription errors.
_OTP_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def hash_password(raw: str) -> str:
    return pwd_context.hash(raw)


def verify_password(raw: str, hashed: str) -> bool:
    return pwd_context.verify(raw, hashed)


def generate_otp_code(length: int | None = None) -> str:
    """CSPRNG alphanumeric code, e.g. 'K7QX9P' -- never random.random()."""
    length = length or settings.OTP_LENGTH
    return "".join(secrets.choice(_OTP_ALPHABET) for _ in range(length))


def hash_otp_code(code: str) -> str:
    # OTPs are short and low-entropy compared to passwords, but we still
    # hash rather than store plaintext, and bcrypt's cost factor makes
    # brute-forcing a 6-char alphanumeric space impractical within the
    # code's short expiry window.
    return pwd_context.hash(code.upper())


def verify_otp_code(raw: str, hashed: str) -> bool:
    return pwd_context.verify(raw.upper(), hashed)


def is_test_bypass_code(raw: str) -> bool:
    """True if `raw` matches the dev/test bypass code (OTP_TEST_BYPASS_CODE)
    -- used by signup-OTP and 2FA verification as an *additional* way to
    pass, alongside the real code, never instead of checking it. Two
    conditions must both hold, not just "the var happens to be set": the
    app must not be running in production, and the var must be non-empty.
    Belt-and-suspenders on purpose -- this is exactly the kind of bypass
    that becomes a real vulnerability if it ever leaks into production
    (see the verify_pending_signup bug fixed earlier this same session)."""
    return (
        not settings.is_production
        and bool(settings.OTP_TEST_BYPASS_CODE)
        and raw.upper() == settings.OTP_TEST_BYPASS_CODE.upper()
    )


def generate_opaque_token() -> str:
    """Used for refresh tokens and password-reset links: a random secret
    the client holds, of which we only ever store a hash server-side."""
    return secrets.token_urlsafe(48)


def hash_token(raw: str) -> str:
    # Refresh/reset tokens are high-entropy already (unlike OTPs), so a fast
    # SHA-256 lookup hash is appropriate here -- bcrypt would also work but
    # is unnecessary cost for a value that can't be brute-forced anyway, and
    # we need this to be a fast, deterministic index lookup by hash.
    import hashlib

    return hashlib.sha256(raw.encode()).hexdigest()


def create_access_token(subject: int, extra_claims: dict | None = None) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(subject),
        "type": "access",
        "iat": now,
        "exp": now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    }
    if extra_claims:
        payload.update(extra_claims)
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> dict:
    """Raises jose.JWTError on bad signature/expiry -- caller translates to 401."""
    payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    if payload.get("type") != "access":
        raise JWTError("wrong token type")
    return payload
