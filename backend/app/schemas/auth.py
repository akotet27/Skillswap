import re

from pydantic import BaseModel, EmailStr, Field, field_validator

# Length alone isn't "strength" -- also require a real mix of character
# classes: lowercase, uppercase, number, and symbol, all four (the
# "Google-style" bar explicitly requested, not the looser 3-of-4 this
# used to require). Mirrored client-side in utils/passwordStrength.js for
# live feedback, but *this* is the check that actually gets enforced.
_CLASS_PATTERNS = [r"[a-z]", r"[A-Z]", r"[0-9]", r"[^a-zA-Z0-9]"]


def _validate_password_strength(value: str) -> str:
    classes_met = sum(
        1 for pattern in _CLASS_PATTERNS if re.search(pattern, value))
    if classes_met < len(_CLASS_PATTERNS):
        raise ValueError(
            "Password must be at least 8 characters and include lowercase letters, "
            "uppercase letters, numbers, and symbols."
        )
    return value


class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: str = Field(min_length=1, max_length=120)
    timezone: str = "UTC"

    _check_password_strength = field_validator(
        "password")(_validate_password_strength)


class SignupResponse(BaseModel):
    message: str
    email: EmailStr
    verification_code: str | None = None


class VerifyOtpRequest(BaseModel):
    email: EmailStr
    code: str


class ResendOtpRequest(BaseModel):
    email: EmailStr


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class LoginResponse(BaseModel):
    # When the account has 2FA enabled, login returns a challenge instead
    # of tokens -- the client must call /auth/2fa/verify next.
    requires_2fa: bool = False
    challenge_user_id: int | None = None
    access_token: str | None = None
    refresh_token: str | None = None
    token_type: str = "bearer"


class TwoFactorVerifyRequest(BaseModel):
    user_id: int
    code: str


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    token: str
    new_password: str = Field(min_length=8, max_length=128)

    _check_password_strength = field_validator(
        "new_password")(_validate_password_strength)


class TotpSetupResponse(BaseModel):
    secret: str
    otpauth_uri: str  # render as a QR code client-side


class TotpEnableRequest(BaseModel):
    code: str


class TotpDisableRequest(BaseModel):
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)

    _check_password_strength = field_validator(
        "new_password")(_validate_password_strength)
