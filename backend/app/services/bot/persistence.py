"""
Bot Persistence Service — Save/load bot messages, scenes, preferences.

Only persists valuable messages (chat + alert), not ephemeral ones (scene/poke/idle).
Auto-cleans messages older than RETENTION_DAYS.
"""

import structlog
from datetime import datetime, timedelta
from typing import Optional
from sqlalchemy import select, desc, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.bot import BotMessage, BotScene, BotPreference

logger = structlog.get_logger()

RETENTION_DAYS = 30
BOT_CONTEXT_WINDOW = 5  # Last N chat messages for bot short-term memory


class BotPersistenceService:
    def __init__(self, session: AsyncSession):
        self.session = session

    # ══════════════════════════════════════
    # Messages
    # ══════════════════════════════════════

    async def save_user_message(self, user_id: int, content: str) -> BotMessage:
        """Save a user → bot chat message."""
        msg = BotMessage(
            user_id=user_id,
            direction="user_to_bot",
            msg_type="chat",
            content=content,
        )
        self.session.add(msg)
        await self.session.commit()
        return msg

    async def save_bot_response(
        self,
        user_id: int,
        content: str,
        emotion: str = None,
        action: str = None,
        tool_calls: list = None,
        msg_type: str = "chat",
    ) -> BotMessage:
        """Save a bot → user message (chat response or alert)."""
        msg = BotMessage(
            user_id=user_id,
            direction="bot_to_user",
            msg_type=msg_type,
            content=content,
            emotion=emotion,
            action=action,
            tool_calls=tool_calls,
        )
        self.session.add(msg)
        await self.session.commit()
        return msg

    async def get_recent_messages(self, user_id: int, limit: int = 20) -> list[dict]:
        """Get recent bot messages for UI display."""
        stmt = (
            select(BotMessage)
            .where(BotMessage.user_id == user_id)
            .order_by(desc(BotMessage.created_at))
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        msgs = result.scalars().all()
        # Reverse to chronological order
        msgs = list(reversed(msgs))
        return [
            {
                "id": m.id,
                "direction": m.direction,
                "msg_type": m.msg_type,
                "content": m.content,
                "emotion": m.emotion,
                "action": m.action,
                "tool_calls": m.tool_calls,
                "created_at": m.created_at.isoformat() if m.created_at else None,
            }
            for m in msgs
        ]

    async def get_context_for_brain(self, user_id: int) -> list[dict]:
        """
        Get last N chat messages for Bot Brain short-term memory.
        Returns in LLM message format [{role, content}].
        """
        stmt = (
            select(BotMessage)
            .where(
                BotMessage.user_id == user_id,
                BotMessage.msg_type == "chat",
            )
            .order_by(desc(BotMessage.created_at))
            .limit(BOT_CONTEXT_WINDOW * 2)  # Get pairs (user + bot)
        )
        result = await self.session.execute(stmt)
        msgs = list(reversed(result.scalars().all()))
        return [
            {
                "role": "user" if m.direction == "user_to_bot" else "assistant",
                "content": m.content or "",
            }
            for m in msgs
        ]

    async def cleanup_old_messages(self, user_id: int = None):
        """Delete messages older than RETENTION_DAYS."""
        cutoff = datetime.utcnow() - timedelta(days=RETENTION_DAYS)
        stmt = delete(BotMessage).where(BotMessage.created_at < cutoff)
        if user_id:
            stmt = stmt.where(BotMessage.user_id == user_id)
        result = await self.session.execute(stmt)
        await self.session.commit()
        if result.rowcount:
            logger.info("Bot messages cleaned up", deleted=result.rowcount)

    # ══════════════════════════════════════
    # Scenes
    # ══════════════════════════════════════

    async def get_all_scenes(self) -> list[dict]:
        """Get all scene configurations."""
        stmt = select(BotScene).order_by(BotScene.scene_key)
        result = await self.session.execute(stmt)
        scenes = result.scalars().all()
        return [
            {
                "id": s.id,
                "scene_key": s.scene_key,
                "priority": s.priority,
                "emotion": s.emotion,
                "action": s.action,
                "template": s.template,
                "data_action": s.data_action,
                "is_active": s.is_active,
            }
            for s in scenes
        ]

    async def get_scene(self, scene_key: str) -> Optional[dict]:
        """Get a specific scene by key."""
        stmt = select(BotScene).where(BotScene.scene_key == scene_key, BotScene.is_active == True)
        result = await self.session.execute(stmt)
        s = result.scalar_one_or_none()
        if not s:
            return None
        return {
            "scene_key": s.scene_key,
            "priority": s.priority,
            "emotion": s.emotion,
            "action": s.action,
            "template": s.template,
            "data_action": s.data_action,
        }

    async def upsert_scene(self, scene_key: str, data: dict) -> dict:
        """Create or update a scene configuration."""
        stmt = select(BotScene).where(BotScene.scene_key == scene_key)
        result = await self.session.execute(stmt)
        scene = result.scalar_one_or_none()

        if scene:
            for key in ("priority", "emotion", "action", "template", "data_action", "is_active"):
                if key in data:
                    setattr(scene, key, data[key])
        else:
            scene = BotScene(scene_key=scene_key, **{k: v for k, v in data.items() if k in ("priority", "emotion", "action", "template", "data_action", "is_active")})
            self.session.add(scene)

        await self.session.commit()
        return {"scene_key": scene.scene_key, "updated": True}

    # ══════════════════════════════════════
    # Preferences
    # ══════════════════════════════════════

    async def get_preferences(self, user_id: int) -> dict:
        """Get user's bot preferences (creates default if none)."""
        stmt = select(BotPreference).where(BotPreference.user_id == user_id)
        result = await self.session.execute(stmt)
        pref = result.scalar_one_or_none()

        if not pref:
            return {
                "mode": "B",
                "persona_id": "clawford",
                "position_x": None,
                "position_y": None,
                "bot_size": 180,
                "bot_enabled": True,
                "custom_personas": None,
            }

        return {
            "mode": pref.mode,
            "persona_id": pref.persona_id,
            "position_x": pref.position_x,
            "position_y": pref.position_y,
            "bot_size": pref.bot_size,
            "bot_enabled": pref.bot_enabled,
            "custom_personas": pref.custom_personas,
        }

    async def save_preferences(self, user_id: int, data: dict) -> dict:
        """Save user's bot preferences (upsert)."""
        stmt = select(BotPreference).where(BotPreference.user_id == user_id)
        result = await self.session.execute(stmt)
        pref = result.scalar_one_or_none()

        if not pref:
            pref = BotPreference(user_id=user_id)
            self.session.add(pref)

        for key in ("mode", "persona_id", "position_x", "position_y", "bot_size", "bot_enabled", "custom_personas"):
            if key in data:
                setattr(pref, key, data[key])

        await self.session.commit()
        return {"saved": True}
