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
        "app.tasks.badge_tasks",
        "app.tasks.waitlist_tasks",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    # See CELERY_TASK_ALWAYS_EAGER in core/config.py -- lets the app run
    # with no separate worker process by executing .delay()/.apply_async()
    # calls synchronously, in-process, the moment they're queued. Off by
    # default (local dev and any deploy running a real worker+beat process
    # leave this alone). One real limitation: `eta=`/`countdown=` scheduling
    # (used for session-reminder emails, see swap_requests.py) can't be
    # honored in eager mode -- there's no scheduler holding the task until
    # that future time, so callers must guard those specifically rather
    # than relying on this flag to handle it for them.
    task_always_eager=settings.CELERY_TASK_ALWAYS_EAGER,
    task_eager_propagates=settings.CELERY_TASK_ALWAYS_EAGER,
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
    "notify-skill-waitlist-daily": {
        "task": "app.tasks.waitlist_tasks.notify_waitlist_matches",
        "schedule": crontab(hour=6, minute=0),  # once a day, off-peak
    },
}
