from __future__ import annotations

import re
import unicodedata

from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.models.user import User


def slugify_username(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value).encode(
        "ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", normalized).strip("-").lower()
    slug = re.sub(r"-{2,}", "-", slug)
    return slug or "user"


def build_unique_username(db: DbSession, value: str, exclude_user_id: int | None = None) -> str:
    base = slugify_username(value)
    candidate = base
    suffix = 2
    while True:
        query = select(User.id).where(User.username == candidate)
        if exclude_user_id is not None:
            query = query.where(User.id != exclude_user_id)
        existing = db.scalar(query)
        if existing is None:
            return candidate
        candidate = f"{base}-{suffix}"
        suffix += 1
