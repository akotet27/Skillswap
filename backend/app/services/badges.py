"""Simple earned-badge rules derived from existing session/rating data.

The badge set is intentionally small and hardcoded for v1. New rows are
append-only in `user_badges`; calling the award helper repeatedly is safe
because it checks for existing rows before inserting.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone

from sqlalchemy import select, func, desc
from sqlalchemy.orm import Session as DbSession

from app.models.rating import Rating
from app.models.session import Session, SessionParticipant, ParticipantRole, SessionStatus
from app.models.user import UserBadge
from app.services.badge_catalog import BADGE_DEFINITIONS


def _session_duration_hours(session: Session) -> float:
    return max((session.scheduled_end_utc - session.scheduled_start_utc).total_seconds() / 3600.0, 0.0)


def _completed_sessions_taught(db: DbSession, user_id: int) -> list[Session]:
    return db.scalars(
        select(Session)
        .join(SessionParticipant)
        .where(
            SessionParticipant.user_id == user_id,
            SessionParticipant.role == ParticipantRole.TEACHER,
            Session.status == SessionStatus.COMPLETED,
        )
        .order_by(Session.created_at.asc())
    ).all()


def _badge_rows(db: DbSession, user_id: int) -> set[str]:
    return set(db.scalars(select(UserBadge.badge_key).where(UserBadge.user_id == user_id)).all())


def award_badges_for_user(db: DbSession, user_id: int) -> list[str]:
    earned = _badge_rows(db, user_id)
    newly_awarded: list[str] = []

    completed_sessions = db.scalars(
        select(Session)
        .join(SessionParticipant)
        .where(
            SessionParticipant.user_id == user_id,
            Session.status == SessionStatus.COMPLETED,
        )
        .order_by(Session.created_at.asc())
    ).all()

    if completed_sessions and "first_swap" not in earned:
        newly_awarded.append("first_swap")

    taught_sessions = [
        s for s in completed_sessions
        if any(p.user_id == user_id and p.role == ParticipantRole.TEACHER for p in s.participants)
    ]
    if sum(_session_duration_hours(s) for s in taught_sessions) >= 10 and "10_hours_taught" not in earned:
        newly_awarded.append("10_hours_taught")

    distinct_taught_skills = {
        s.request.skill_learned_id
        for s in taught_sessions
        if s.request is not None
    }
    if len(distinct_taught_skills) >= 3 and "polyglot" not in earned:
        newly_awarded.append("polyglot")

    ratings = db.scalars(
        select(Rating.score)
        .where(Rating.ratee_id == user_id)
        .order_by(Rating.created_at.desc())
        .limit(5)
    ).all()
    if len(ratings) == 5 and all(score == 5 for score in ratings) and "5_star_streak" not in earned:
        newly_awarded.append("5_star_streak")

    for badge_key in newly_awarded:
        db.add(UserBadge(user_id=user_id, badge_key=badge_key, earned_at=datetime.now(timezone.utc)))

    if newly_awarded:
        db.flush()
    return newly_awarded
