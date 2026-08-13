"""
Phase 4 support: ICE server config assembly and guest-invite tokens.

Guest invites deliberately don't create a User row (per the spec: "no
account required"). A guest is just someone holding a signed, room- and
time-scoped token -- itsdangerous (already a dependency, used for the
session-cookie middleware) is a good fit: no new dependency, and it's
exactly the "short-lived signed capability" use case it's designed for.
"""
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired

from app.core.config import settings

GUEST_TOKEN_SALT = "video-guest-invite"
GUEST_TOKEN_MAX_AGE_SECONDS = 60 * 60 * 24  # 24h -- a guest link shouldn't outlive the session by much

_serializer = URLSafeTimedSerializer(settings.JWT_SECRET_KEY)


def build_ice_servers() -> list[dict]:
    """Google's public STUN server is free with no signup; TURN credentials
    (ExpressTURN or similar) come from env vars so the secret never lives
    in frontend source -- the frontend fetches this from
    GET /api/video/ice-servers instead of hardcoding it."""
    servers = [{"urls": settings.STUN_URL}]
    if settings.TURN_URL and settings.TURN_USERNAME and settings.TURN_CREDENTIAL:
        servers.append({"urls": settings.TURN_URL, "username": settings.TURN_USERNAME, "credential": settings.TURN_CREDENTIAL})
    return servers


def create_guest_token(room_id: str) -> str:
    """The token is purely a room-scoped capability -- it does NOT carry a
    name. A guest types their own display name when they actually click
    the link and join (same UX as any real video-call guest link), rather
    than the inviter picking it for them up front."""
    return _serializer.dumps({"room_id": room_id}, salt=GUEST_TOKEN_SALT)


class InvalidGuestTokenError(Exception):
    pass


def verify_guest_token(token: str, room_id: str) -> None:
    """Raises if the token is invalid, expired, or wasn't issued for this
    exact room; returns nothing on success."""
    try:
        data = _serializer.loads(token, salt=GUEST_TOKEN_SALT, max_age=GUEST_TOKEN_MAX_AGE_SECONDS)
    except (BadSignature, SignatureExpired) as e:
        raise InvalidGuestTokenError(str(e))
    if data.get("room_id") != room_id:
        raise InvalidGuestTokenError("Token was not issued for this room")
