from datetime import datetime, time

from pydantic import BaseModel, Field, model_validator

from app.models.skill import SkillType


class BadgeOut(BaseModel):
    badge_key: str
    label: str
    earned_at: datetime

    class Config:
        from_attributes = True


class UserOut(BaseModel):
    id: int
    email: str
    name: str
    username: str | None
    photo_url: str | None
    bio: str | None
    timezone: str
    age: int | None
    is_email_verified: bool
    totp_enabled: bool
    is_admin: bool
    is_active: bool
    created_at: datetime
    badges: list[BadgeOut] = Field(default_factory=list)

    class Config:
        from_attributes = True


class UserUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    username: str | None = Field(default=None, min_length=1, max_length=80)
    bio: str | None = Field(default=None, max_length=280)
    timezone: str | None = None
    # adults-only platform -- see ck_user_age_range
    age: int | None = Field(default=None, ge=18, le=130)


class PublicSkillOut(BaseModel):
    id: int
    name: str
    category: str

    class Config:
        from_attributes = True


class PublicUserOut(BaseModel):
    id: int
    name: str
    username: str | None
    photo_url: str | None
    bio: str | None
    rating_average: float | None
    rating_count: int
    availability_summary: str | None
    teach_skills: list[PublicSkillOut]
    badges: list[BadgeOut] = Field(default_factory=list)

    class Config:
        from_attributes = True


class SkillOut(BaseModel):
    id: int
    name: str
    category: str

    class Config:
        from_attributes = True


class UserSkillOut(BaseModel):
    id: int
    skill: SkillOut
    type: SkillType
    # Only computed for 'want' rows (see list_my_skills) -- whether anyone
    # currently teaches this skill. None for 'have' rows, where the
    # question doesn't apply.
    has_teacher: bool | None = None

    class Config:
        from_attributes = True


class UserSkillCreate(BaseModel):
    skill_name: str = Field(min_length=1, max_length=100)
    category: str = Field(min_length=1, max_length=60, default="General")
    type: SkillType


class AvailabilityBlockIn(BaseModel):
    day_of_week: int = Field(ge=0, le=6)  # 0=Monday .. 6=Sunday
    start_time: time
    end_time: time
    timezone: str

    # No overnight-block concept (a block is one day_of_week, full stop) --
    # an end_time <= start_time is always invalid input, not a legitimate
    # "spans midnight" case. Booking silently miscomputed these into an
    # end-before-start UTC range and 422'd deep in the swap-request flow,
    # far from where the bad data actually got saved -- catching it here
    # means it can never be saved in the first place.
    @model_validator(mode="after")
    def _check_time_order(self):
        if self.end_time <= self.start_time:
            raise ValueError("End time must be after start time.")
        return self


class AvailabilityBlockOut(AvailabilityBlockIn):
    id: int

    class Config:
        from_attributes = True
