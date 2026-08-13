"""Skill catalog search, backing the tag-input autocomplete on the profile
editor. Deliberately unauthenticated (read-only, low-value target) but
still behind the global rate limiter applied in main.py."""
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.db.session import get_db
from app.models.skill import Skill
from app.schemas.user import SkillOut

router = APIRouter(prefix="/api/skills", tags=["skills"])


@router.get("", response_model=list[SkillOut])
def search_skills(q: str = "", db: DbSession = Depends(get_db)):
    query = select(Skill).order_by(Skill.name)
    if q:
        query = query.where(Skill.name.ilike(f"%{q}%"))
    return db.scalars(query.limit(20)).all()
