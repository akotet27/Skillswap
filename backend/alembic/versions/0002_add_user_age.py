"""add users.age (post-signup onboarding field)

Revision ID: 0002_add_user_age
Revises: 0001_initial
Create Date: 2026-08-12
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0002_add_user_age"
down_revision: Union[str, None] = "0001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("age", sa.SmallInteger(), nullable=True))
    op.create_check_constraint("ck_user_age_range", "users", "age IS NULL OR (age >= 13 AND age <= 130)")


def downgrade() -> None:
    op.drop_constraint("ck_user_age_range", "users", type_="check")
    op.drop_column("users", "age")
