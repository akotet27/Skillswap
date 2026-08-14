"""Aggregate read-only queries backing the admin analytics dashboard (see
app/api/routes/admin.py's /analytics endpoint). Nothing here writes -- it's
a handful of GROUP BY queries over data other modules already own, kept in
one place so the admin route stays thin."""
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session as DbSession

from app.models.credit import CreditTransaction, CreditStatus
from app.models.session import Session, SessionStatus
from app.models.skill import Skill, UserSkill, SkillType
from app.models.swap_request import SwapRequest, SwapRequestStatus
from app.models.user import User

SIGNUP_WINDOW_DAYS = 30
TOP_SKILLS_LIMIT = 8


def signups_over_time(db: DbSession) -> list[dict]:
    """Daily signup counts for the trailing 30 days, zero-filled so the
    chart doesn't have gaps on quiet days."""
    since = datetime.now(timezone.utc) - timedelta(days=SIGNUP_WINDOW_DAYS)
    day = func.date(User.created_at)
    rows = db.execute(
        select(day.label("day"), func.count(User.id)).where(User.created_at >= since).group_by(day).order_by(day)
    ).all()
    counts = {str(r.day): r[1] for r in rows}

    out = []
    for i in range(SIGNUP_WINDOW_DAYS, -1, -1):
        d = (datetime.now(timezone.utc) - timedelta(days=i)).date()
        out.append({"date": d.isoformat(), "count": counts.get(str(d), 0)})
    return out


def _top_skills(db: DbSession, skill_type: SkillType, limit: int = TOP_SKILLS_LIMIT) -> list[dict]:
    rows = db.execute(
        select(Skill.name, func.count(UserSkill.id).label("n"))
        .join(UserSkill, UserSkill.skill_id == Skill.id)
        .where(UserSkill.type == skill_type)
        .group_by(Skill.name)
        .order_by(func.count(UserSkill.id).desc())
        .limit(limit)
    ).all()
    return [{"skill_name": name, "count": n} for name, n in rows]


def top_taught_skills(db: DbSession) -> list[dict]:
    return _top_skills(db, SkillType.HAVE)


def top_wanted_skills(db: DbSession) -> list[dict]:
    return _top_skills(db, SkillType.WANT)


def avg_time_to_first_match_hours(db: DbSession) -> float | None:
    """For each user with at least one accepted swap request, the hours
    between account creation and their *earliest* accepted request
    (whichever side of it they were on) -- averaged across those users.
    None if nobody has an accepted request yet (nothing to average)."""
    rows = db.execute(
        select(SwapRequest.requester_id, SwapRequest.recipient_id, SwapRequest.created_at).where(
            SwapRequest.status == SwapRequestStatus.ACCEPTED
        )
    ).all()
    if not rows:
        return None

    first_match_at: dict[int, datetime] = {}
    for requester_id, recipient_id, created_at in rows:
        for uid in (requester_id, recipient_id):
            if uid not in first_match_at or created_at < first_match_at[uid]:
                first_match_at[uid] = created_at

    user_ids = list(first_match_at.keys())
    signup_times = dict(db.execute(select(User.id, User.created_at).where(User.id.in_(user_ids))).all())

    deltas_hours = []
    for uid, matched_at in first_match_at.items():
        signup = signup_times.get(uid)
        if signup is None:
            continue
        deltas_hours.append((matched_at - signup).total_seconds() / 3600)

    if not deltas_hours:
        return None
    return sum(deltas_hours) / len(deltas_hours)


def sessions_completed_count(db: DbSession) -> int:
    return db.scalar(select(func.count(Session.id)).where(Session.status == SessionStatus.COMPLETED)) or 0


def credits_in_circulation(db: DbSession) -> float:
    """Sum of every user's current spendable balance -- i.e. every
    non-pending ledger row, system-wide. Same status filter as
    services/credits.py:get_balance(), just without the user_id filter.
    A float, not an int -- 'earned' rows can be fractional (duration-based
    partial credit)."""
    total = db.scalar(
        select(func.coalesce(func.sum(CreditTransaction.amount), 0)).where(
            CreditTransaction.status.in_([CreditStatus.AVAILABLE, CreditStatus.SPENT])
        )
    )
    return round(float(total or 0), 3)
