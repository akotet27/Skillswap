"""
Centralized settings, loaded once from environment variables / .env.

Everything that differs between dev and prod (secrets, URLs, feature toggles)
lives here so the rest of the app never reads os.environ directly. Using
pydantic-settings gives us validation for free -- the app fails fast at
startup if a required var is missing, instead of failing weirdly later.
"""
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    ENVIRONMENT: str = "development"

    # Database
    DATABASE_URL: str = "postgresql+psycopg://skillswap:skillswap@localhost:5432/skillswap"

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # Celery
    CELERY_BROKER_URL: str = "redis://localhost:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/2"

    # JWT
    JWT_SECRET_KEY: str = "dev-only-insecure-secret-change-me"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # Google OAuth
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = "http://localhost:8000/api/auth/google/callback"

    # CORS
    FRONTEND_ORIGIN: str = "http://localhost:5173"

    # Email
    # "console" (default) logs the email instead of sending it -- safe for
    # local dev/testing, never hits a real SMTP server. "smtp" actually
    # sends via the MAIL_* settings below -- works locally and on hosts
    # that allow outbound SMTP. "resend" sends via Resend's HTTPS API
    # instead of raw SMTP -- needed on hosts (e.g. Render's free web
    # service tier) that block outbound SMTP ports entirely; HTTPS is
    # never blocked since the app already makes outbound HTTPS calls
    # elsewhere (Google OAuth). Requires RESEND_API_KEY below.
    EMAIL_BACKEND: str = "console"
    MAIL_USERNAME: str = ""
    MAIL_PASSWORD: str = ""
    MAIL_FROM: str = "noreply@skillswap.local"
    MAIL_FROM_NAME: str = "SkillSwap"
    MAIL_SERVER: str = "smtp.resend.com"
    MAIL_PORT: int = 587
    MAIL_STARTTLS: bool = True
    MAIL_SSL_TLS: bool = False
    RESEND_API_KEY: str = ""

    # TURN / STUN
    STUN_URL: str = "stun:stun.l.google.com:19302"
    TURN_URL: str = ""
    TURN_USERNAME: str = ""
    TURN_CREDENTIAL: str = ""

    # OTP -- only governs signup-verification codes (see
    # app/services/pending_signup.py); password reset uses its own
    # separate, longer-lived token.
    OTP_LENGTH: int = 6
    OTP_EXPIRE_MINUTES: int = 5

    # Uploads
    UPLOAD_DIR: str = "./uploads"
    MAX_UPLOAD_MB: int = 10

    # Free-tier deploy path (see DEPLOYMENT.md) -- lets the whole app run
    # without a separate Celery worker process. When true, .delay()/
    # .apply_async() calls execute synchronously in the same process
    # instead of being queued to a broker/worker. Leave false for local dev
    # (run a real `celery worker` as documented in README.md) and for any
    # deploy that does pay for a real skillswap-worker service.
    CELERY_TASK_ALWAYS_EAGER: bool = False

    # Shared secret an external scheduler (see
    # .github/workflows/scheduled-sweeps.yml) must present to trigger the
    # periodic sweeps Celery Beat would otherwise run on its own schedule.
    # Only relevant when CELERY_TASK_ALWAYS_EAGER is true -- there's no
    # separate beat process to fire these on a schedule by itself.
    INTERNAL_SWEEP_SECRET: str = ""

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT.lower() == "production"


@lru_cache
def get_settings() -> Settings:
    # lru_cache -> Settings() is constructed once per process and reused
    # (env vars don't change at runtime, so re-parsing every call is waste).
    return Settings()


settings = get_settings()
