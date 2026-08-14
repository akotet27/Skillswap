"""
Profile, "skills I have / want" tags, and the weekly availability editor
(Phase 1). Skill search/autocomplete lives here too since it's tightly
coupled to the UserSkill tag-input UI.
"""
import os
import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy import select, func
from sqlalchemy.orm import Session as DbSession

from app.core.cache import cache_invalidate, match_cache_key
from app.core.config import settings
from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.availability import Availability
from app.models.rating import Rating
from app.models.skill import Skill, UserSkill, SkillType
from app.models.user import User
from app.ws.connection_manager import manager
from app.schemas.user import (
    UserOut,
    UserUpdate,
    SkillOut,
    UserSkillOut,
    UserSkillCreate,
    AvailabilityBlockIn,
    AvailabilityBlockOut,
    PublicUserOut,
    PublicSkillOut,
    BadgeOut,
)
from app.services.usernames import build_unique_username

router = APIRouter(prefix="/api/users", tags=["users"])


@router.patch("/me", response_model=UserOut)
def update_me(payload: UserUpdate, user: User = Depends(get_current_user), db: DbSession = Depends(get_db)):
    if payload.name is not None:
        user.name = payload.name
    if payload.username is not None:
        user.username = build_unique_username(
            db, payload.username, exclude_user_id=user.id)
    if payload.bio is not None:
        user.bio = payload.bio
    if payload.timezone is not None:
        user.timezone = payload.timezone
    if payload.age is not None:
        user.age = payload.age
    db.commit()
    return user


@router.post("/me/photo", response_model=UserOut)
def upload_photo(
    file: UploadFile = File(...), user: User = Depends(get_current_user), db: DbSession = Depends(get_db)
):
    allowed = {"image/jpeg", "image/png", "image/webp"}
    if file.content_type not in allowed:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            "Only JPEG, PNG, or WEBP images are allowed")

    contents = file.file.read(settings.MAX_UPLOAD_MB * 1024 * 1024 + 1)
    if len(contents) > settings.MAX_UPLOAD_MB * 1024 * 1024:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            f"File exceeds {settings.MAX_UPLOAD_MB}MB limit")

    os.makedirs(os.path.join(settings.UPLOAD_DIR, "avatars"), exist_ok=True)
    ext = {"image/jpeg": "jpg", "image/png": "png",
           "image/webp": "webp"}[file.content_type]
    filename = f"{uuid.uuid4().hex}.{ext}"
    path = os.path.join(settings.UPLOAD_DIR, "avatars", filename)
    with open(path, "wb") as f:
        f.write(contents)

    user.photo_url = f"/uploads/avatars/{filename}"
    db.commit()
    return user


# NOTE: /presence must be registered before /{user_id} for the same
# reason documented at the /me/skills vs /{user_id}/skills split further
# down -- "presence" is otherwise a syntactically valid match for
# {user_id} and would get captured there first if the dynamic route came
# first, 422'ing on the int-parse instead of ever reaching this handler.
@router.get("/presence")
def get_presence(ids: str, _user: User = Depends(get_current_user)):
    """Bulk online/offline check for a comma-separated list of user ids --
    used by list views (conversation list, browse/match cards) that show
    many people's presence at once, without each opening its own
    WebSocket just to ask. Backed by the same ConnectionManager real-time
    chat and video signaling already use: "online" means "has an active
    WS connection to any room right now", not a separately tracked
    state -- see app/ws/connection_manager.py."""
    try:
        id_list = [int(x) for x in ids.split(",") if x.strip()]
    except ValueError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            "ids must be a comma-separated list of integers")
    online = manager.online_ids(id_list)
    return {uid: (uid in online) for uid in id_list}


@router.get("/{user_id}", response_model=UserOut)
def get_public_profile(user_id: int, db: DbSession = Depends(get_db)):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    return user


@router.get("/public/{identifier}", response_model=PublicUserOut)
def get_public_profile_by_identifier(identifier: str, db: DbSession = Depends(get_db)):
    user = None
    if identifier.isdigit():
        user = db.get(User, int(identifier))
    if user is None:
        user = db.scalar(select(User).where(User.username == identifier))
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    teach_skills = db.scalars(
        select(UserSkill)
        .where(UserSkill.user_id == user.id, UserSkill.type == SkillType.HAVE)
        .order_by(UserSkill.created_at.desc())
    ).all()
    ratings = db.scalar(
        select(func.coalesce(func.avg(Rating.score), 0.0)).where(
            Rating.ratee_id == user.id)
    )
    rating_count = db.scalar(select(func.count(Rating.id)).where(
        Rating.ratee_id == user.id)) or 0

    availability = db.scalars(select(Availability).where(
        Availability.user_id == user.id)).all()
    availability_summary = _summarize_availability(availability)

    return PublicUserOut(
        id=user.id,
        name=user.name,
        username=user.username,
        photo_url=user.photo_url,
        bio=user.bio,
        rating_average=float(ratings) if ratings is not None else None,
        rating_count=int(rating_count),
        availability_summary=availability_summary,
        teach_skills=[PublicSkillOut.model_validate(
            link.skill) for link in teach_skills],
        badges=[BadgeOut.model_validate(badge) for badge in user.badges],
    )


def _summarize_availability(blocks: list[Availability]) -> str | None:
    if not blocks:
        return None
    day_names = ["Monday", "Tuesday", "Wednesday",
                 "Thursday", "Friday", "Saturday", "Sunday"]
    parts: list[str] = []
    seen: set[str] = set()
    for block in blocks:
        start_hour = block.start_time.hour
        if 5 <= start_hour < 12:
            part = "mornings"
        elif 12 <= start_hour < 17:
            part = "afternoons"
        else:
            part = "evenings"
        label = f"{day_names[block.day_of_week]} {part}"
        if label not in seen:
            seen.add(label)
            parts.append(label)
    if not parts:
        return None
    if len(parts) == 1:
        return f"Usually available {parts[0].lower()}"
    if len(parts) == 2:
        return f"Usually available {parts[0].lower()} and {parts[1].lower()}"
    return f"Usually available {parts[0].lower()}, {parts[1].lower()}, and more"


# --- Skills I Have / Want ---
#
# NOTE: /me/skills (below) must be registered before /{user_id}/skills.
# FastAPI/Starlette match routes in registration order, and "me" is a
# syntactically valid match for the {user_id} path param -- if the
# dynamic route came first, GET /api/users/me/skills would be captured
# by get_public_skills(user_id="me") and 422 trying to parse "me" as an
# int, instead of ever reaching list_my_skills. (This is exactly what
# happened before this comment was added -- the Add button worked, but
# the list-refresh call right after it was silently hitting the wrong
# handler, so newly added skills never showed up.)


@router.get("/me/skills", response_model=list[UserSkillOut])
def list_my_skills(user: User = Depends(get_current_user), db: DbSession = Depends(get_db)):
    links = db.scalars(select(UserSkill).where(UserSkill.user_id == user.id)).all()

    # has_teacher is only meaningful for 'want' rows -- it's what drives the
    # "notify me" prompt on the profile editor (see skills.py's waitlist
    # endpoints). One query for every wanted skill_id rather than N+1.
    want_skill_ids = {link.skill_id for link in links if link.type == SkillType.WANT}
    taught_skill_ids = set()
    if want_skill_ids:
        taught_skill_ids = set(
            db.scalars(
                select(UserSkill.skill_id).where(
                    UserSkill.skill_id.in_(want_skill_ids), UserSkill.type == SkillType.HAVE
                )
            ).all()
        )
    for link in links:
        link.has_teacher = (link.skill_id in taught_skill_ids) if link.type == SkillType.WANT else None
    return links


@router.post("/me/skills", response_model=UserSkillOut, status_code=status.HTTP_201_CREATED)
def add_my_skill(payload: UserSkillCreate, user: User = Depends(get_current_user), db: DbSession = Depends(get_db)):
    skill = db.scalar(select(Skill).where(
        Skill.name.ilike(payload.skill_name)))
    if skill is None:
        skill = Skill(name=payload.skill_name, category=payload.category)
        db.add(skill)
        db.flush()

    existing = db.scalar(
        select(UserSkill).where(
            UserSkill.user_id == user.id, UserSkill.skill_id == skill.id, UserSkill.type == payload.type
        )
    )
    if existing is not None:
        raise HTTPException(status.HTTP_409_CONFLICT,
                            "That skill is already tagged")

    # A skill can't be both taught and wanted by the same person -- doesn't
    # make sense (why would you want to learn something you already
    # teach?), and it would also silently break matching, since the
    # algorithm assumes have/want are disjoint per user.
    opposite_type = SkillType.WANT if payload.type == SkillType.HAVE else SkillType.HAVE
    existing_opposite = db.scalar(
        select(UserSkill).where(
            UserSkill.user_id == user.id, UserSkill.skill_id == skill.id, UserSkill.type == opposite_type
        )
    )
    if existing_opposite is not None:
        other_label = "something you teach" if opposite_type == SkillType.HAVE else "something you want to learn"
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f'"{skill.name}" is already tagged as {other_label} -- remove it from there first if you want to move it.',
        )

    link = UserSkill(user_id=user.id, skill_id=skill.id, type=payload.type)
    db.add(link)
    db.commit()
    db.refresh(link)
    # Cross-cutting requirement #17: invalidate the match cache on writes
    # that affect it. We only invalidate *my own* cached match list here --
    # this change may also affect other users' match lists (if I'm now a
    # candidate for them), but invalidating every other user's cache on
    # every skill edit isn't tractable without a reverse index, so those
    # entries fall back to the cache's short TTL (app/core/cache.py) to
    # bound staleness instead. A deliberate v1 simplification.
    cache_invalidate(match_cache_key(user.id))
    return link


@router.delete("/me/skills/{user_skill_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_my_skill(user_skill_id: int, user: User = Depends(get_current_user), db: DbSession = Depends(get_db)):
    link = db.get(UserSkill, user_skill_id)
    if link is None or link.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    db.delete(link)
    db.commit()
    cache_invalidate(match_cache_key(user.id))


@router.get("/{user_id}/skills", response_model=list[UserSkillOut])
def get_public_skills(user_id: int, _user: User = Depends(get_current_user), db: DbSession = Depends(get_db)):
    """Someone else's tagged skills -- the booking flow needs this to work
    out which skill they'd be teaching in a given session (their 'have'
    tags that overlap with what I 'want')."""
    if db.get(User, user_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    return db.scalars(select(UserSkill).where(UserSkill.user_id == user_id)).all()


# --- Availability ---


@router.get("/me/availability", response_model=list[AvailabilityBlockOut])
def list_my_availability(user: User = Depends(get_current_user), db: DbSession = Depends(get_db)):
    return db.scalars(select(Availability).where(Availability.user_id == user.id)).all()


@router.put("/me/availability", response_model=list[AvailabilityBlockOut])
def replace_my_availability(
    blocks: list[AvailabilityBlockIn], user: User = Depends(get_current_user), db: DbSession = Depends(get_db)
):
    """Full replace, not incremental patch -- the weekly editor UI always
    submits its complete current state, which is simpler to reason about
    than diffing individual blocks client-side."""
    db.query(Availability).filter(Availability.user_id == user.id).delete()
    rows = [Availability(user_id=user.id, **block.model_dump())
            for block in blocks]
    db.add_all(rows)
    db.commit()
    cache_invalidate(match_cache_key(user.id))
    return db.scalars(select(Availability).where(Availability.user_id == user.id)).all()


@router.get("/{user_id}/availability", response_model=list[AvailabilityBlockOut])
def get_public_availability(
    user_id: int, _user: User = Depends(get_current_user), db: DbSession = Depends(get_db)
):
    """Read-only view of someone else's weekly availability -- used by the
    booking flow to render bookable slots. Requires auth (not world-public)
    since it's personal schedule data, but any logged-in user can view any
    other's, same as browsing matches."""
    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    return db.scalars(select(Availability).where(Availability.user_id == user_id)).all()
