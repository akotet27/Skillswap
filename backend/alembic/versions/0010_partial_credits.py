"""duration-based partial credits: call_attendance table, credit_transactions.amount -> Numeric(4,3)

Revision ID: 0010_partial_credits
Revises: 0009_skill_waitlist
Create Date: 2026-08-14
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0010_partial_credits"
down_revision: Union[str, None] = "0009_skill_waitlist"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "call_attendance",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("session_id", sa.Integer(), sa.ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("joined_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("left_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.drop_constraint("ck_credit_amount_unit", "credit_transactions", type_="check")
    op.alter_column(
        "credit_transactions", "amount",
        type_=sa.Numeric(4, 3),
        existing_type=sa.Integer(),
        postgresql_using="amount::numeric(4,3)",
    )
    op.create_check_constraint(
        "ck_credit_amount_range",
        "credit_transactions",
        "(type = 'earned' AND amount > 0 AND amount <= 1) OR (type <> 'earned' AND amount IN (1, -1))",
    )


def downgrade() -> None:
    op.drop_constraint("ck_credit_amount_range", "credit_transactions", type_="check")
    op.alter_column(
        "credit_transactions", "amount",
        type_=sa.Integer(),
        existing_type=sa.Numeric(4, 3),
        postgresql_using="round(amount)::integer",
    )
    op.create_check_constraint("ck_credit_amount_unit", "credit_transactions", "amount IN (1, -1)")
    op.drop_table("call_attendance")
