"""Bot models — message history, scene config, user preferences."""

from sqlalchemy import Column, Integer, String, ForeignKey, Text, Float, Boolean, JSON
from app.models.base import Base, TimestampMixin


class BotMessage(Base, TimestampMixin):
    """Persisted bot conversation messages (chat + alert only, not scene/poke/idle)."""
    __tablename__ = "bot_messages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    direction = Column(String(20), nullable=False)    # bot_to_user / user_to_bot
    msg_type = Column(String(20), nullable=False)     # chat / alert / tool_call
    content = Column(Text)
    emotion = Column(String(20))
    action = Column(String(20))
    tool_name = Column(String(50))                    # which tool was called
    tool_result = Column(JSON)                        # tool execution result
    tool_calls = Column(JSON)                         # [{tool, success}] for bot responses


class BotScene(Base, TimestampMixin):
    """Configurable scene definitions (admin-editable)."""
    __tablename__ = "bot_scenes"

    id = Column(Integer, primary_key=True, autoincrement=True)
    scene_key = Column(String(50), unique=True, nullable=False)   # e.g. "page:dashboard"
    priority = Column(String(20), default="medium")               # low/medium/high/critical
    emotion = Column(String(20), default="idle")
    action = Column(String(20))                                   # wave/nod/think/null
    template = Column(Text)                                       # Speech template with {vars}
    data_action = Column(String(100))                             # API/tool to call for dynamic data
    is_active = Column(Boolean, default=True)


class BotPreference(Base, TimestampMixin):
    """Per-user bot preferences (position, size, mode, persona)."""
    __tablename__ = "bot_preferences"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    mode = Column(String(5), default="B")             # A/B/C
    persona_id = Column(String(50), default="clawford")
    position_x = Column(Float)                        # Last bot position X
    position_y = Column(Float)                        # Last bot position Y
    bot_size = Column(Integer, default=180)
    bot_enabled = Column(Boolean, default=True)
    custom_personas = Column(JSON)                    # User-created personas [{id, name, ...}]
