"""Celery task for earned badges.

Triggered after a session completes so badge checks stay off the request
path and use the already-committed database state.
"""
from app.celery_app import celery_app
from app.db.session import SessionLocal
from app.models.session import Session, SessionParticipant
from app.services.badges import award_badges_for_user
from sqlalchemy import select


@celery_app.task(name="app.tasks.badge_tasks.award_session_badges")
def award_session_badges(session_id: int) -> list[str]:
    db = SessionLocal()
    try:
        session = db.get(Session, session_id)
        if session is None:
            return []
        awarded: list[str] = []
        participant_ids = db.scalars(select(SessionParticipant.user_id).where(
            SessionParticipant.session_id == session_id)).all()
        for user_id in participant_ids:
            awarded.extend(award_badges_for_user(db, user_id))
        db.commit()
        return awarded
    finally:
        db.close()
