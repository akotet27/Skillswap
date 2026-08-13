"""
Phase 2 matching algorithm.

A "mutual match" for user A is another user B such that:
  - B has (teaches) at least one skill A wants, AND
  - B wants (to learn) at least one skill A has

i.e. their `have`/`want` sets complement each other in both directions.
One-directional overlap (they teach what I want, but I don't teach
anything they want) is intentionally excluded -- SkillSwap is a *swap*,
and a one-sided match still shows up in "Browse" implicitly if we relaxed
this, but the spec calls out "mutual match" specifically, so we filter to
that up front rather than post-filtering a looser query.

Ranking is by timezone/availability overlap: users are more useful matches
if their free time blocks actually line up, regardless of how many skills
overlap (a mutual match with zero calendar overlap is nearly useless).

Query shape: this runs as two indexed lookups (my skill ids, then a single
join query for candidates) rather than N+1 per-candidate queries -- see
cross-cutting requirement #8 (avoid N+1 in the matching algorithm).
"""
from dataclasses import dataclass, field
from datetime import datetime, date, timedelta, time as dtime
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession, selectinload

from app.models.availability import Availability
from app.models.skill import UserSkill, SkillType
from app.models.user import User

# Any Monday works as the reference date -- we only care about
# day-of-week + time-of-day, projected onto one arbitrary ISO week so we
# can convert local wall-clock times to UTC instants (and get DST handled
# correctly by zoneinfo) and then compare overlap in absolute time.
_REFERENCE_MONDAY = date(2024, 1, 1)  # a Monday


def _block_to_utc_range(block: Availability) -> tuple[datetime, datetime]:
    day = _REFERENCE_MONDAY + timedelta(days=block.day_of_week)
    tz = ZoneInfo(block.timezone)
    start = datetime.combine(day, block.start_time, tzinfo=tz)
    end = datetime.combine(day, block.end_time, tzinfo=tz)
    if end <= start:
        # Overnight block (e.g. 22:00-01:00) -- roll the end to the next day.
        end += timedelta(days=1)
    return start.astimezone(ZoneInfo("UTC")), end.astimezone(ZoneInfo("UTC"))


def _overlap_minutes(a_blocks: list[Availability], b_blocks: list[Availability]) -> int:
    """Sum of overlapping minutes across every pair of blocks, across two
    representative weeks (this week and next) so a Sunday-night block for
    one user can still be compared against a Monday-morning block for the
    other without an artificial week-boundary cliff."""
    total = 0
    a_ranges = [_block_to_utc_range(b) for b in a_blocks]
    b_ranges = [_block_to_utc_range(b) for b in b_blocks]
    for shift_days in (0, 7):
        shift = timedelta(days=shift_days)
        for a_start, a_end in a_ranges:
            for b_start, b_end in b_ranges:
                b_start_s, b_end_s = b_start + shift, b_end + shift
                latest_start = max(a_start, b_start_s)
                earliest_end = min(a_end, b_end_s)
                if earliest_end > latest_start:
                    total += int((earliest_end - latest_start).total_seconds() // 60)
    return total


@dataclass
class MatchCandidate:
    user: User
    they_teach_you: list[str] = field(default_factory=list)   # skill names
    you_teach_them: list[str] = field(default_factory=list)   # skill names
    overlap_minutes: int = 0


def find_matches(db: DbSession, current_user: User, limit: int = 30) -> list[MatchCandidate]:
    my_links = db.scalars(select(UserSkill).where(UserSkill.user_id == current_user.id)).all()
    my_have_ids = {l.skill_id for l in my_links if l.type == SkillType.HAVE}
    my_want_ids = {l.skill_id for l in my_links if l.type == SkillType.WANT}
    if not my_have_ids or not my_want_ids:
        return []  # can't compute a *mutual* match without both sides tagged

    # Candidates: anyone (other than me) who has at least one skill I want.
    candidate_ids = set(
        db.scalars(
            select(UserSkill.user_id).where(
                UserSkill.type == SkillType.HAVE,
                UserSkill.skill_id.in_(my_want_ids),
                UserSkill.user_id != current_user.id,
            )
        ).all()
    )
    if not candidate_ids:
        return []

    # Single query for every candidate's skill links (avoids N+1), plus
    # their availability, eager-loaded together.
    all_links = db.scalars(
        select(UserSkill).where(UserSkill.user_id.in_(candidate_ids)).options(selectinload(UserSkill.skill))
    ).all()
    links_by_user: dict[int, list[UserSkill]] = {}
    for link in all_links:
        links_by_user.setdefault(link.user_id, []).append(link)

    mutual: list[tuple[int, list[str], list[str]]] = []
    for uid, links in links_by_user.items():
        have = [l for l in links if l.type == SkillType.HAVE]
        want = [l for l in links if l.type == SkillType.WANT]
        they_teach_you = [l.skill.name for l in have if l.skill_id in my_want_ids]
        you_teach_them = [l.skill.name for l in want if l.skill_id in my_have_ids]
        if they_teach_you and you_teach_them:  # the "mutual" requirement
            mutual.append((uid, they_teach_you, you_teach_them))

    if not mutual:
        return []

    mutual_ids = [uid for uid, _, _ in mutual]
    users_by_id = {u.id: u for u in db.scalars(select(User).where(User.id.in_(mutual_ids))).all()}

    my_availability = db.scalars(select(Availability).where(Availability.user_id == current_user.id)).all()
    all_availability = db.scalars(select(Availability).where(Availability.user_id.in_(mutual_ids))).all()
    availability_by_user: dict[int, list[Availability]] = {}
    for a in all_availability:
        availability_by_user.setdefault(a.user_id, []).append(a)

    results = []
    for uid, they_teach_you, you_teach_them in mutual:
        user = users_by_id.get(uid)
        if user is None:
            continue
        overlap = _overlap_minutes(my_availability, availability_by_user.get(uid, []))
        results.append(
            MatchCandidate(user=user, they_teach_you=they_teach_you, you_teach_them=you_teach_them, overlap_minutes=overlap)
        )

    results.sort(key=lambda m: m.overlap_minutes, reverse=True)
    return results[:limit]
