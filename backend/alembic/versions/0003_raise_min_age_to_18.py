"""raise ck_user_age_range floor from 13 to 18 (adults-only platform)

SkillSwap pairs strangers for 1:1 video sessions -- 13 was meant as a
"rule out garbage input" floor, not an actual policy decision. Raising it
to a real age-gate now that the distinction was pointed out.

Revision ID: 0003_raise_min_age_to_18
Revises: 0002_add_user_age
Create Date: 2026-08-12
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0003_raise_min_age_to_18"
down_revision: Union[str, None] = "0002_add_user_age"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint("ck_user_age_range", "users", type_="check")
    op.create_check_constraint("ck_user_age_range", "users", "age IS NULL OR (age >= 18 AND age <= 130)")


def downgrade() -> None:
    op.drop_constraint("ck_user_age_range", "users", type_="check")
    op.create_check_constraint("ck_user_age_range", "users", "age IS NULL OR (age >= 13 AND age <= 130)")
