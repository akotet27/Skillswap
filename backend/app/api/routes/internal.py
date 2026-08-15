"""
Internal, secret-protected endpoints that let an external scheduler (see
.github/workflows/scheduled-sweeps.yml) trigger the same periodic sweeps
Celery Beat normally runs on its own schedule (app/celery_app.py's
beat_schedule). Only meaningful on the free-tier deploy path that skips
paying for a separate skillswap-worker process -- see DEPLOYMENT.md for
when/why you'd use this instead of a real worker+beat.

Calling the task objects directly (not via .delay()/.apply_async()) runs
them synchronously in this request regardless of CELERY_TASK_ALWAYS_EAGER --
that's deliberate, since this route only exists to be triggered on-demand
by something external, not queued.
"""
from fastapi import APIRouter, Header, HTTPException, status

from app.core.config import settings
from app.tasks.credit_tasks import release_available_credits_task
from app.tasks.waitlist_tasks import notify_waitlist_matches

router = APIRouter(prefix="/api/internal/sweeps", tags=["internal"])


def _require_sweep_secret(x_sweep_secret: str | None) -> None:
    if not settings.INTERNAL_SWEEP_SECRET or x_sweep_secret != settings.INTERNAL_SWEEP_SECRET:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or missing sweep secret")


@router.post("/credit-escrow")
def run_credit_escrow_sweep(x_sweep_secret: str | None = Header(default=None)):
    """Mirrors celery_app.py's hourly 'release-pending-credits-hourly' entry."""
    _require_sweep_secret(x_sweep_secret)
    count = release_available_credits_task()
    return {"released": count}


@router.post("/waitlist")
def run_waitlist_sweep(x_sweep_secret: str | None = Header(default=None)):
    """Mirrors celery_app.py's daily 'notify-skill-waitlist-daily' entry."""
    _require_sweep_secret(x_sweep_secret)
    notified = notify_waitlist_matches()
    return {"notified": notified}
