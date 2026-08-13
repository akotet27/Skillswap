"""
Celery application + Beat schedule. Every email send and the credit-escrow
sweep run here, never synchronously in a request handler (cross-cutting
requirement #5). Run with:

    celery -A app.celery_app worker --loglevel=info --pool=solo   # Windows-friendly
    celery -A app.celery_app beat --loglevel=info
"""
from celery import Celery
from celery.schedules import crontab

from app.core.config import settings

celery_app = Celery(
    "skillswap",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=[
        "app.tasks.email_tasks",
        "app.tasks.credit_tasks",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
)

# Beat schedule: the escrow-release sweep runs hourly, per the spec
# (Phase 5, step 3). Session-reminder emails are scheduled individually as
# one-off tasks with an ETA at booking time (see app/tasks/email_tasks.py),
# not on this fixed schedule.
celery_app.conf.beat_schedule = {
    "release-pending-credits-hourly": {
        "task": "app.tasks.credit_tasks.release_available_credits",
        "schedule": crontab(minute=0),  # top of every hour
    },
}
