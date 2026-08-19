"""
Signup verification, redesigned so an unverified signup never touches the
`users` table at all. The original design created a `User` row
immediately at signup (`is_email_verified=False`) and only flipped that
flag after the OTP check -- meaning every abandoned signup (typo'd email,
never checked the inbox, just testing) left a permanent row behind
forever. Never fixed itself, only grew.

Now the pending signup (email, hashed password, name, timezone, hashed
OTP) lives in Redis with a TTL matching the OTP's own expiry window --
it vanishes on its own if never verified, no cleanup job required, and
no `User` row exists until verification actually succeeds. This also
means a never-verified email doesn't "squat" on that address: someone
else (or the same person, typo corrected) can sign up with it again
immediately, since nothing was ever reserved in the real table.
"""
import json

from app.core.config import settings
from app.core.redis_client import redis_client
from app.core.security import generate_otp_code, hash_otp_code, hash_password, is_test_bypass_code, verify_otp_code

_KEY_PREFIX = "pending_signup:"


def _key(email: str) -> str:
    return f"{_KEY_PREFIX}{email.lower()}"


def create_pending_signup(email: str, password: str, name: str, timezone_: str) -> str:
    """Stores the would-be account + a fresh OTP in Redis. Returns the raw
    code (caller emails it; only its hash is stored)."""
    code = generate_otp_code()
    payload = {
        "email": email,
        "password_hash": hash_password(password),
        "name": name,
        "timezone": timezone_,
        "otp_hash": hash_otp_code(code),
    }
    redis_client.set(_key(email), json.dumps(payload), ex=settings.OTP_EXPIRE_MINUTES * 60)
    return code


def resend_pending_signup(email: str) -> str | None:
    """Re-issues a fresh OTP for an existing pending signup (same email/
    password/name/timezone already on file), resetting the TTL. Returns
    the new raw code, or None if there's nothing pending for this email
    (already verified, never signed up, or the original entry already
    expired) -- the route layer treats both cases identically in its
    response, same anti-enumeration reasoning as verify_pending_signup."""
    raw = redis_client.get(_key(email))
    if raw is None:
        return None
    pending = json.loads(raw)
    code = generate_otp_code()
    pending["otp_hash"] = hash_otp_code(code)
    redis_client.set(_key(email), json.dumps(pending), ex=settings.OTP_EXPIRE_MINUTES * 60)
    return code


def verify_pending_signup(email: str, code: str) -> dict | None:
    """Returns the stored signup payload on a correct code and deletes the
    Redis entry (it's about to become a real User row, so the pending
    copy is done). Returns None on a wrong code or an expired/missing
    entry -- the caller can't tell which from this alone, which is
    deliberate (don't leak whether an email has a pending signup)."""
    raw = redis_client.get(_key(email))
    if raw is None:
        return None
    pending = json.loads(raw)
    if not verify_otp_code(code, pending["otp_hash"]) and not is_test_bypass_code(code):
        return None
    redis_client.delete(_key(email))
    return pending
