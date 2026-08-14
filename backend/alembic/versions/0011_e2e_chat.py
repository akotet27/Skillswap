"""end-to-end encrypted chat: users.public_key, messages.iv

Revision ID: 0011_e2e_chat
Revises: 0010_partial_credits
Create Date: 2026-08-14
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0011_e2e_chat"
down_revision: Union[str, None] = "0010_partial_credits"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("public_key", sa.Text(), nullable=True))
    op.add_column("messages", sa.Column("iv", sa.String(length=32), nullable=True))


def downgrade() -> None:
    op.drop_column("messages", "iv")
    op.drop_column("users", "public_key")
