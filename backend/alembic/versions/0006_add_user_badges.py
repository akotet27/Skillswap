"""add user badges table

Revision ID: 0006_add_user_badges
Revises: 0005_add_user_username_and_bio
Create Date: 2026-08-13
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0006_add_user_badges"
down_revision: Union[str, None] = "0005_add_user_username_and_bio"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "user_badges",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey(
            "users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("badge_key", sa.String(length=64), nullable=False),
        sa.Column("earned_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now()),
        sa.CheckConstraint("badge_key <> ''",
                           name="ck_user_badges_badge_key_nonempty"),
        sa.UniqueConstraint("user_id", "badge_key",
                            name="uq_user_badges_once_per_badge"),
    )
    op.create_index("ix_user_badges_user_id", "user_badges", ["user_id"])
    op.create_index("ix_user_badges_badge_key", "user_badges", ["badge_key"])


def downgrade() -> None:
    op.drop_index("ix_user_badges_badge_key", table_name="user_badges")
    op.drop_index("ix_user_badges_user_id", table_name="user_badges")
    op.drop_table("user_badges")
