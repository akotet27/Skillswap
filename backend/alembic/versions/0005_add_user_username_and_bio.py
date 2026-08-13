"""add username and bio to users

Revision ID: 0005_add_user_username_and_bio
Revises: 0004_add_credit_type_bonus
Create Date: 2026-08-13
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0005_add_user_username_and_bio"
down_revision: Union[str, None] = "0004_add_credit_type_bonus"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("username", sa.String(length=80), nullable=True))
    op.add_column("users", sa.Column("bio", sa.String(length=280), nullable=True))

    bind = op.get_bind()
    users = bind.execute(sa.text("SELECT id, name FROM users ORDER BY id")).fetchall()
    seen: set[str] = set()

    def slugify(value: str) -> str:
        import re
        import unicodedata

        normalized = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
        slug = re.sub(r"[^a-zA-Z0-9]+", "-", normalized).strip("-").lower()
        slug = re.sub(r"-{2,}", "-", slug)
        return slug or "user"

    for row in users:
        base = slugify(row.name)
        candidate = base
        suffix = 2
        while candidate in seen:
            candidate = f"{base}-{suffix}"
            suffix += 1
        seen.add(candidate)
        bind.execute(sa.text("UPDATE users SET username = :username WHERE id = :id"), {"username": candidate, "id": row.id})

    op.create_index("ix_users_username", "users", ["username"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_users_username", table_name="users")
    op.drop_column("users", "bio")
    op.drop_column("users", "username")