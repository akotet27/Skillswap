"""add conversation_participants.last_read_at, 'system' message_type value

Two small additive changes bundled together since they're both messaging
infra: last_read_at backs the unread-badge/toast feature (per-participant
read-state on the existing join table, not a new one); 'system' is a new
Message.type value for auto-inserted "X joined/left the call" rows.

Revision ID: 0007_conv_read_system_msg
Revises: 0006_add_user_badges
Create Date: 2026-08-13
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0007_conv_read_system_msg"
down_revision: Union[str, None] = "0006_add_user_badges"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("conversation_participants", sa.Column("last_read_at", sa.DateTime(timezone=True), nullable=True))
    # Enum values can't be added inside a transaction in Postgres.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE message_type ADD VALUE IF NOT EXISTS 'system'")


def downgrade() -> None:
    # 'system' can't be cleanly dropped from the enum (see the same
    # reasoning in 0004_add_credit_type_bonus) -- any system rows would
    # need hand migration first. The column drop is safe on its own.
    op.drop_column("conversation_participants", "last_read_at")
