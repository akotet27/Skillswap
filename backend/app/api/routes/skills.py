"""Skill catalog search, backing the tag-input autocomplete on the profile
editor. Deliberately unauthenticated (read-only, low-value target) but
still behind the global rate limiter applied in main.py.

Also owns the "notify me" waitlist for skills nobody teaches yet -- see
SkillWaitlist (app/models/skill.py) and the daily sweep in
app/tasks/waitlist_tasks.py."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.skill import Skill, SkillWaitlist
from app.models.user import User
from app.schemas.user import SkillOut
from app.schemas.waitlist import WaitlistOut

router = APIRouter(prefix="/api/skills", tags=["skills"])


@router.get("", response_model=list[SkillOut])
def search_skills(q: str = "", db: DbSession = Depends(get_db)):
    query = select(Skill).order_by(Skill.name)
    if q:
        query = query.where(Skill.name.ilike(f"%{q}%"))
    return db.scalars(query.limit(20)).all()


# /me/waitlist must be registered before /{skill_id}/waitlist -- same
# route-ordering rule as everywhere else in this codebase (see e.g.
# /api/users/me/skills vs /api/users/{user_id}/skills): "me" would
# otherwise be captured by {skill_id} and 422 trying to parse it as an int.
@router.get("/me/waitlist", response_model=list[WaitlistOut])
def list_my_waitlist(user: User = Depends(get_current_user), db: DbSession = Depends(get_db)):
    return db.scalars(
        select(SkillWaitlist).where(SkillWaitlist.user_id == user.id).order_by(SkillWaitlist.created_at.desc())
    ).all()


@router.post("/{skill_id}/waitlist", response_model=WaitlistOut, status_code=status.HTTP_201_CREATED)
def join_waitlist(skill_id: int, user: User = Depends(get_current_user), db: DbSession = Depends(get_db)):
    """Join the "notify me when someone can teach this" list. Idempotent --
    calling it again while already on the list just returns the existing
    row rather than erroring, since the frontend button doesn't need to
    track whether this is a first click."""
    skill = db.get(Skill, skill_id)
    if skill is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Skill not found")

    existing = db.scalar(
        select(SkillWaitlist).where(SkillWaitlist.user_id == user.id, SkillWaitlist.skill_id == skill_id)
    )
    if existing is not None:
        return existing

    entry = SkillWaitlist(user_id=user.id, skill_id=skill_id)
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@router.delete("/{skill_id}/waitlist", status_code=status.HTTP_204_NO_CONTENT)
def leave_waitlist(skill_id: int, user: User = Depends(get_current_user), db: DbSession = Depends(get_db)):
    entry = db.scalar(
        select(SkillWaitlist).where(SkillWaitlist.user_id == user.id, SkillWaitlist.skill_id == skill_id)
    )
    if entry is not None:
        db.delete(entry)
        db.commit()
