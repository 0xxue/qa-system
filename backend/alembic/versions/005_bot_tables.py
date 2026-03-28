"""Add bot_messages, bot_scenes, bot_preferences tables.

Revision ID: 005
Revises: 004
Create Date: 2026-03-28
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Bot message history (only chat + alert, not scene/poke/idle)
    op.create_table(
        "bot_messages",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("direction", sa.String(20), nullable=False),
        sa.Column("msg_type", sa.String(20), nullable=False),
        sa.Column("content", sa.Text()),
        sa.Column("emotion", sa.String(20)),
        sa.Column("action", sa.String(20)),
        sa.Column("tool_name", sa.String(50)),
        sa.Column("tool_result", sa.JSON()),
        sa.Column("tool_calls", sa.JSON()),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_bot_messages_user_id", "bot_messages", ["user_id"])
    op.create_index("ix_bot_messages_created", "bot_messages", ["created_at"])

    # Bot scene configuration (admin-editable)
    op.create_table(
        "bot_scenes",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("scene_key", sa.String(50), unique=True, nullable=False),
        sa.Column("priority", sa.String(20), server_default="medium"),
        sa.Column("emotion", sa.String(20), server_default="idle"),
        sa.Column("action", sa.String(20)),
        sa.Column("template", sa.Text()),
        sa.Column("data_action", sa.String(100)),
        sa.Column("is_active", sa.Boolean(), server_default="true"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_bot_scenes_key", "bot_scenes", ["scene_key"])

    # Seed default scenes
    op.execute("""
        INSERT INTO bot_scenes (scene_key, priority, emotion, action, template, data_action) VALUES
        ('login', 'high', 'happy', 'wave', 'Welcome back! Let me check today''s updates...', NULL),
        ('page:chat', 'low', 'happy', NULL, 'Chat mode! Ask me anything', NULL),
        ('page:kb', 'low', 'idle', NULL, 'Knowledge base! Upload docs or search here', NULL),
        ('page:dashboard', 'medium', 'thinking', NULL, 'Dashboard loading... Let me check the numbers', 'fetch_system_overview'),
        ('page:settings', 'low', 'idle', NULL, 'Settings! You can customize me here', NULL),
        ('data:anomaly', 'critical', 'surprised', 'nod', 'Anomaly detected: {detail}', 'fetch_anomaly_detail'),
        ('data:expiry_warning', 'high', 'surprised', NULL, 'Reminder: {count} items expiring soon', 'fetch_expiring_items'),
        ('qa:complete', 'low', 'happy', 'nod', NULL, NULL),
        ('qa:error', 'medium', 'sad', NULL, 'Sorry, I couldn''t process that. {error}', NULL)
    """)

    # Per-user bot preferences
    op.create_table(
        "bot_preferences",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), unique=True, nullable=False),
        sa.Column("mode", sa.String(5), server_default="B"),
        sa.Column("persona_id", sa.String(50), server_default="clawford"),
        sa.Column("position_x", sa.Float()),
        sa.Column("position_y", sa.Float()),
        sa.Column("bot_size", sa.Integer(), server_default="180"),
        sa.Column("bot_enabled", sa.Boolean(), server_default="true"),
        sa.Column("custom_personas", sa.JSON()),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("bot_preferences")
    op.drop_table("bot_scenes")
    op.drop_index("ix_bot_messages_created", "bot_messages")
    op.drop_index("ix_bot_messages_user_id", "bot_messages")
    op.drop_table("bot_messages")
