"""Add summary fields to conversations for context compression.

Revision ID: 004
Revises: 003
Create Date: 2026-03-28
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("conversations", sa.Column("summary", sa.Text(), nullable=True))
    op.add_column("conversations", sa.Column("summary_up_to", sa.Integer(), server_default="0", nullable=False))


def downgrade() -> None:
    op.drop_column("conversations", "summary_up_to")
    op.drop_column("conversations", "summary")
