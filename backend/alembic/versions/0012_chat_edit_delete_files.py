"""chat: edit/delete messages, generic file attachments

Revision ID: 0012_chat_edit_delete_files
Revises: 0011_e2e_chat
Create Date: 2026-08-14
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0012_chat_edit_delete_files"
down_revision: Union[str, None] = "0011_e2e_chat"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE message_type ADD VALUE IF NOT EXISTS 'file'")

    op.add_column("messages", sa.Column("file_name", sa.String(length=255), nullable=True))
    op.add_column("messages", sa.Column("file_size", sa.Integer(), nullable=True))
    op.add_column("messages", sa.Column("file_mime", sa.String(length=120), nullable=True))
    op.add_column("messages", sa.Column("edited_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("messages", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("messages", "deleted_at")
    op.drop_column("messages", "edited_at")
    op.drop_column("messages", "file_mime")
    op.drop_column("messages", "file_size")
    op.drop_column("messages", "file_name")
    # Not removing 'file' from the message_type enum -- Postgres can't
    # drop a single enum value without rebuilding the type, and any FILE
    # rows created in the meantime would break. Matches this repo's
    # existing convention for added enum values (see 0008_moderation).
