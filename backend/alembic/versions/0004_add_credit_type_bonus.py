"""add 'bonus' value to credit_type enum (signup starting-credit grant)

Reverses the original spec's "no starting bonus" rule -- new accounts now
get a one-time grant of SIGNUP_BONUS_CREDITS (see app/services/credits.py)
on creation, recorded with this distinct type so the ledger honestly shows
it wasn't earned by teaching.

Revision ID: 0004_add_credit_type_bonus
Revises: 0003_raise_min_age_to_18
Create Date: 2026-08-12
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0004_add_credit_type_bonus"
down_revision: Union[str, None] = "0003_raise_min_age_to_18"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Postgres enum values can't be dropped inside a transaction (or at
    # all, without rebuilding the type), so downgrade() can't cleanly
    # remove this -- ADD VALUE is safe and additive, applied outside the
    # migration's implicit transaction since Postgres requires that.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE credit_type ADD VALUE IF NOT EXISTS 'bonus'")


def downgrade() -> None:
    # Deliberately a no-op -- see upgrade()'s comment. Any 'bonus' rows
    # would need to be migrated to another type by hand before a real
    # downgrade, which isn't automatable safely.
    pass
