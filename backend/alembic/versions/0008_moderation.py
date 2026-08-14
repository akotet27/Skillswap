"""moderation: users.is_active, reports table, credit_type 'adjustment' + reason

Revision ID: 0008_moderation
Revises: 0007_conv_read_system_msg
Create Date: 2026-08-14
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0008_moderation"
down_revision: Union[str, None] = "0007_conv_read_system_msg"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.alter_column("users", "is_active", server_default=None)  # server_default was only to backfill existing rows

    op.add_column("credit_transactions", sa.Column("reason", sa.String(length=280), nullable=True))
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE credit_type ADD VALUE IF NOT EXISTS 'adjustment'")

    # Not calling report_status.create() explicitly -- create_table()
    # creates enum-typed columns' underlying Postgres type itself
    # (checkfirst=True by default), so a separate .create() call raced it
    # and 500'd on "type already exists".
    report_status = sa.Enum("open", "resolved", name="report_status")
    op.create_table(
        "reports",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("session_id", sa.Integer(), sa.ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("reporter_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("reported_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("reason", sa.String(length=100), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("status", report_status, nullable=False, server_default="open", index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), index=True),
    )


def downgrade() -> None:
    op.drop_table("reports")
    sa.Enum(name="report_status").drop(op.get_bind())
    op.drop_column("credit_transactions", "reason")
    op.drop_column("users", "is_active")
