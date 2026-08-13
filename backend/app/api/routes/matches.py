"""Phase 2 browse/discovery surface -- GET /api/matches. Cached in Redis
per-user (cross-cutting requirement #17); see app/core/cache.py and the
invalidation calls in app/api/routes/users.py wherever skills/availability
change."""
from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session as DbSession

from app.core.cache import cache_get_or_set, match_cache_key
from app.core.deps import get_current_user
from app.core.limiter import limiter
from app.db.session import get_db
from app.models.user import User
from app.schemas.match import MatchOut
from app.services.matching import find_matches

router = APIRouter(prefix="/api/matches", tags=["matches"])


@router.get("", response_model=list[MatchOut])
@limiter.limit("30/minute")
def browse_matches(request: Request, user: User = Depends(get_current_user), db: DbSession = Depends(get_db)):
    def compute():
        candidates = find_matches(db, user)
        return [
            MatchOut(
                user=candidate.user,
                they_teach_you=candidate.they_teach_you,
                you_teach_them=candidate.you_teach_them,
                overlap_minutes=candidate.overlap_minutes,
            ).model_dump(mode="json")
            for candidate in candidates
        ]

    return cache_get_or_set(match_cache_key(user.id), compute)
