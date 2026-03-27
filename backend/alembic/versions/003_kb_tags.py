"""Add tags to kb_collections and kb_documents.

Revision ID: 003
Revises: 002
Create Date: 2026-03-28
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Tags on collections for categorization
    op.add_column("kb_collections", sa.Column("tags", sa.JSON(), server_default="[]"))
    # Category field for quick filtering
    op.add_column("kb_collections", sa.Column("category", sa.String(50), server_default="general"))

    # Also add tags on documents for finer control
    op.add_column("kb_documents", sa.Column("tags", sa.JSON(), server_default="[]"))


def downgrade() -> None:
    op.drop_column("kb_documents", "tags")
    op.drop_column("kb_collections", "category")
    op.drop_column("kb_collections", "tags")
