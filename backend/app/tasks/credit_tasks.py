"""
Celery Beat periodic task for the escrow sweep (Phase 5, step 3). Registered
hourly in app/celery_app.py's beat_schedule.
"""
import logging

from app.celery_app import celery_app
from app.db.session import SessionLocal
from app.services.credits import release_available_credits

logger = logging.getLogger("skillswap.credits")


@celery_app.task(name="app.tasks.credit_tasks.release_available_credits")
def release_available_credits_task() -> int:
    db = SessionLocal()
    try:
        count = release_available_credits(db)
        db.commit()
        if count:
            logger.info("Escrow sweep: released %d credit transaction(s) to 'available'", count)
        return count
    finally:
        db.close()
