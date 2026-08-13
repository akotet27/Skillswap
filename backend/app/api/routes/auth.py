"""
Phase 1 auth: email/password signup + OTP verification, login (with an
optional TOTP 2FA second step), Google OAuth, refresh-token rotation, and
password reset. See app/services/auth_service.py for the token/OTP logic
this route layer calls into.
"""
import logging
from datetime import datetime, timedelta, timezone as tz

import pyotp
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.core.config import settings
from app.core.deps import get_current_user
from app.core.limiter import limiter
from app.core.oauth import oauth
from app.core.security import (
    hash_password,
    verify_password,
    generate_opaque_token,
    hash_token,
)
from app.db.session import get_db
from app.models.auth import OtpPurpose, OtpCode, RefreshToken
from app.models.user import User, LoginAudit
from app.services.usernames import build_unique_username
from app.schemas.auth import (
    SignupRequest,
    SignupResponse,
    VerifyOtpRequest,
    ResendOtpRequest,
    LoginRequest,
    LoginResponse,
    TwoFactorVerifyRequest,
    TokenPair,
    RefreshRequest,
    PasswordResetRequest,
    PasswordResetConfirm,
    TotpSetupResponse,
    TotpEnableRequest,
    TotpDisableRequest,
    ChangePasswordRequest,
)
from app.schemas.user import UserOut
from app.services import auth_service, credits, pending_signup
from app.tasks.email_tasks import send_otp_email, send_password_changed_email, send_password_reset_email

router = APIRouter(prefix="/api/auth", tags=["auth"])
logger = logging.getLogger("skillswap.auth")


def _log_login_attempt(db: DbSession, request: Request, email: str, success: bool, user_id: int | None) -> None:
    db.add(
        LoginAudit(
            user_id=user_id,
            email_attempted=email,
            success=success,
            ip_address=request.client.host if request.client else "unknown",
            user_agent=request.headers.get("user-agent", ""),
        )
    )


@router.post("/signup", response_model=SignupResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
def signup(request: Request, payload: SignupRequest, db: DbSession = Depends(get_db)):
    existing = db.scalar(select(User).where(User.email == payload.email))
    if existing is not None:
        # Same message either way in a real product to avoid user
        # enumeration; kept explicit here since this is a learning project
        # and the clearer error is more useful while building against it.
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists")

    # No User row yet on purpose -- see app/services/pending_signup.py.
    # The account only becomes real once the OTP is verified, so an
    # abandoned signup never leaves a permanent row behind.
    code = pending_signup.create_pending_signup(payload.email, payload.password, payload.name, payload.timezone)
    send_otp_email.delay(payload.email, code, OtpPurpose.SIGNUP_VERIFY.value)
    return SignupResponse(message="Check your email for a verification code.", email=payload.email)


@router.post("/verify-otp", response_model=TokenPair)
@limiter.limit("10/minute")
def verify_signup_otp(request: Request, payload: VerifyOtpRequest, db: DbSession = Depends(get_db)):
    pending = pending_signup.verify_pending_signup(payload.email, payload.code)
    if pending is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid or expired code -- try signing up again")

    # Defensive re-check: someone could've completed a signup for this
    # exact email in the (tiny) window between requests -- e.g. two tabs
    # racing the same signup. The Redis entry is already consumed at this
    # point either way, so the user just has to sign up again.
    if db.scalar(select(User).where(User.email == pending["email"])) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists")

    user = User(
        email=pending["email"],
        password_hash=pending["password_hash"],
        name=pending["name"],
        username=build_unique_username(db, pending["name"]),
        timezone=pending["timezone"],
        is_email_verified=True,  # verified by construction -- we just checked the code
    )
    db.add(user)
    db.flush()
    credits.grant_signup_bonus(db, user.id)

    access, refresh = auth_service.issue_token_pair(db, user)
    db.commit()
    return TokenPair(access_token=access, refresh_token=refresh)


@router.post("/resend-otp", status_code=status.HTTP_202_ACCEPTED)
@limiter.limit("3/minute")
def resend_signup_otp(request: Request, payload: ResendOtpRequest):
    """Re-sends the signup verification code. Rate-limited more tightly
    than signup/verify (3/minute, not 5-10) since its whole purpose is
    triggering an email send -- the obvious abuse vector is spamming
    someone else's inbox by resending against an email you don't own."""
    code = pending_signup.resend_pending_signup(payload.email)
    if code is not None:
        send_otp_email.delay(payload.email, code, OtpPurpose.SIGNUP_VERIFY.value)
    # Always 202 -- same anti-enumeration reasoning as password reset:
    # don't reveal whether this email has a pending signup.
    return {"message": "If that email has a pending signup, a new code has been sent."}


@router.post("/login", response_model=LoginResponse)
@limiter.limit("10/minute")
def login(request: Request, payload: LoginRequest, db: DbSession = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == payload.email))

    if user is None or user.password_hash is None or not verify_password(payload.password, user.password_hash):
        _log_login_attempt(db, request, payload.email, False, user.id if user else None)
        db.commit()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect email or password")

    if not user.is_email_verified:
        db.commit()
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Email not verified yet")

    if user.totp_enabled:
        _log_login_attempt(db, request, payload.email, True, user.id)
        db.commit()
        return LoginResponse(requires_2fa=True, challenge_user_id=user.id)

    _log_login_attempt(db, request, payload.email, True, user.id)
    access, refresh = auth_service.issue_token_pair(db, user)
    db.commit()
    return LoginResponse(access_token=access, refresh_token=refresh)


@router.post("/2fa/verify", response_model=TokenPair)
@limiter.limit("10/minute")
def verify_2fa(request: Request, payload: TwoFactorVerifyRequest, db: DbSession = Depends(get_db)):
    user = db.get(User, payload.user_id)
    if user is None or not user.totp_enabled or not user.totp_secret:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "2FA is not enabled for this account")

    totp = pyotp.TOTP(user.totp_secret)
    if not totp.verify(payload.code, valid_window=1):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid 2FA code")

    access, refresh = auth_service.issue_token_pair(db, user)
    db.commit()
    return TokenPair(access_token=access, refresh_token=refresh)


@router.post("/refresh", response_model=TokenPair)
@limiter.limit("20/minute")
def refresh_token(request: Request, payload: RefreshRequest, db: DbSession = Depends(get_db)):
    try:
        access, refresh, _user = auth_service.rotate_refresh_token(db, payload.refresh_token)
    except auth_service.RefreshTokenReuseError:
        db.commit()  # persist the chain revocation
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Refresh token reuse detected -- please log in again")
    except auth_service.InvalidRefreshTokenError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired refresh token")

    db.commit()
    return TokenPair(access_token=access, refresh_token=refresh)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(payload: RefreshRequest, db: DbSession = Depends(get_db)):
    auth_service.revoke_refresh_token(db, payload.refresh_token)
    db.commit()


@router.get("/google/login")
async def google_login(request: Request):
    redirect_uri = settings.GOOGLE_REDIRECT_URI
    return await oauth.google.authorize_redirect(request, redirect_uri)


@router.get("/google/callback")
async def google_callback(request: Request, db: DbSession = Depends(get_db)):
    token = await oauth.google.authorize_access_token(request)
    userinfo = token.get("userinfo") or await oauth.google.userinfo(token=token)

    google_id = userinfo["sub"]
    email = userinfo["email"]
    name = userinfo.get("name", email.split("@")[0])
    picture = userinfo.get("picture")

    user = db.scalar(select(User).where(User.google_id == google_id))
    if user is None:
        # A local account may already exist with this email -- link it
        # rather than creating a duplicate.
        user = db.scalar(select(User).where(User.email == email))
        if user is not None:
            user.google_id = google_id
        else:
            user = User(
                email=email,
                google_id=google_id,
                name=name,
                username=build_unique_username(db, name),
                photo_url=picture,
                is_email_verified=True,  # Google already verified this address
            )
            db.add(user)
            db.flush()
            credits.grant_signup_bonus(db, user.id)

    access, refresh = auth_service.issue_token_pair(db, user)
    db.commit()

    # Redirect back to the SPA with tokens in the fragment (never a query
    # string, which would land in server logs / browser history).
    return {
        "access_token": access,
        "refresh_token": refresh,
        "redirect": f"{settings.FRONTEND_ORIGIN}/oauth/callback#access_token={access}&refresh_token={refresh}",
    }


@router.post("/password-reset/request", status_code=status.HTTP_202_ACCEPTED)
@limiter.limit("5/minute")
def request_password_reset(request: Request, payload: PasswordResetRequest, db: DbSession = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == payload.email))
    if user is not None:
        raw = generate_opaque_token()
        db.add(
            OtpCode(
                user_id=user.id,
                code_hash=hash_token(raw),  # reuse the fast hash: this is a high-entropy token, not a short OTP
                purpose=OtpPurpose.PASSWORD_RESET,
                expires_at=datetime.now(tz.utc) + timedelta(minutes=30),
            )
        )
        db.commit()
        reset_link = f"{settings.FRONTEND_ORIGIN}/reset-password?token={raw}&uid={user.id}"
        send_password_reset_email.delay(user.email, reset_link)
    # Always 202, regardless of whether the email exists -- don't leak
    # account existence via response differences.
    return {"message": "If that email is registered, a reset link has been sent."}


@router.post("/password-reset/confirm", status_code=status.HTTP_200_OK)
@limiter.limit("10/minute")
def confirm_password_reset(request: Request, payload: PasswordResetConfirm, db: DbSession = Depends(get_db)):
    token_hash = hash_token(payload.token)
    row = db.scalar(
        select(OtpCode).where(
            OtpCode.code_hash == token_hash,
            OtpCode.purpose == OtpPurpose.PASSWORD_RESET,
            OtpCode.used == False,  # noqa: E712
        )
    )
    if row is None or row.expires_at < datetime.now(tz.utc):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid or expired reset link")

    user = db.get(User, row.user_id)
    user.password_hash = hash_password(payload.new_password)
    row.used = True
    # A password reset invalidates every existing refresh token -- if the
    # account was compromised, this kicks out any attacker session too.
    db.query(RefreshToken).filter(RefreshToken.user_id == user.id, RefreshToken.revoked == False).update(  # noqa: E712
        {"revoked": True}
    )
    db.commit()
    send_password_changed_email.delay(user.email)
    return {"message": "Password updated. Please log in again."}


# --- TOTP 2FA management (requires an authenticated session) ---


@router.post("/2fa/setup", response_model=TotpSetupResponse)
def setup_2fa(user: User = Depends(get_current_user), db: DbSession = Depends(get_db)):
    if user.totp_enabled:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "2FA is already enabled")
    secret = pyotp.random_base32()
    user.totp_secret = secret  # not yet "enabled" until /2fa/enable confirms a valid code
    db.commit()
    uri = pyotp.TOTP(secret).provisioning_uri(name=user.email, issuer_name="SkillSwap")
    return TotpSetupResponse(secret=secret, otpauth_uri=uri)


@router.post("/2fa/enable", status_code=status.HTTP_200_OK)
def enable_2fa(payload: TotpEnableRequest, user: User = Depends(get_current_user), db: DbSession = Depends(get_db)):
    if not user.totp_secret:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Call /2fa/setup first")
    if not pyotp.TOTP(user.totp_secret).verify(payload.code, valid_window=1):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid code")
    user.totp_enabled = True
    db.commit()
    return {"message": "2FA enabled"}


@router.post("/2fa/disable", status_code=status.HTTP_200_OK)
def disable_2fa(payload: TotpDisableRequest, user: User = Depends(get_current_user), db: DbSession = Depends(get_db)):
    if user.password_hash and not verify_password(payload.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect password")
    user.totp_enabled = False
    user.totp_secret = None
    db.commit()
    return {"message": "2FA disabled"}


@router.post("/change-password", status_code=status.HTTP_200_OK)
def change_password(payload: ChangePasswordRequest, user: User = Depends(get_current_user), db: DbSession = Depends(get_db)):
    """For a logged-in user changing their password deliberately -- distinct
    from /password-reset/*, which is the "I'm locked out, emailed link"
    flow. Google-only accounts (no password_hash) can't use this; they'd
    need to set a password via some other flow, which v1 doesn't build."""
    if user.password_hash is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This account signs in with Google and has no password to change")
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Current password is incorrect")

    user.password_hash = hash_password(payload.new_password)
    # Same reasoning as the emailed-reset flow: a password change should
    # invalidate every other active session, in case the old password was
    # compromised and this change is the user locking that session out.
    db.query(RefreshToken).filter(RefreshToken.user_id == user.id, RefreshToken.revoked == False).update(  # noqa: E712
        {"revoked": True}
    )
    db.commit()
    send_password_changed_email.delay(user.email)
    return {"message": "Password updated."}


@router.get("/me", response_model=UserOut)
def get_me(user: User = Depends(get_current_user)):
    return user
