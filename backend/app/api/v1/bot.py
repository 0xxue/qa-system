"""
Bot REST API — Messages, Scenes, Preferences

GET    /bot/messages        — Load recent bot messages (for panel restore on refresh)
GET    /bot/scenes          — List all scene configs
PUT    /bot/scenes/{key}    — Update a scene config (admin)
GET    /bot/preferences     — Get user's bot preferences
PUT    /bot/preferences     — Save user's bot preferences
POST   /bot/cleanup         — Trigger old message cleanup (admin)
"""

import structlog
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional

from app.services.auth import get_optional_user
from app.services.bot.persistence import BotPersistenceService

router = APIRouter()
logger = structlog.get_logger()


def _get_sf():
    from app.services.database import _session_factory
    return _session_factory


# ══════════════════════════════════════
# Messages
# ══════════════════════════════════════

@router.get("/messages")
async def get_bot_messages(limit: int = 20, user=Depends(get_optional_user)):
    """Get recent bot messages for chat panel restore."""
    sf = _get_sf()
    if not sf:
        return []
    async with sf() as session:
        svc = BotPersistenceService(session)
        user_id = int(user.id) if str(user.id).isdigit() else 1
        return await svc.get_recent_messages(user_id, limit=limit)


# ══════════════════════════════════════
# Scenes
# ══════════════════════════════════════

@router.get("/scenes")
async def get_bot_scenes(user=Depends(get_optional_user)):
    """List all scene configurations."""
    sf = _get_sf()
    if not sf:
        return []
    async with sf() as session:
        svc = BotPersistenceService(session)
        return await svc.get_all_scenes()


class SceneUpdate(BaseModel):
    priority: Optional[str] = None
    emotion: Optional[str] = None
    action: Optional[str] = None
    template: Optional[str] = None
    data_action: Optional[str] = None
    is_active: Optional[bool] = None


@router.put("/scenes/{scene_key}")
async def update_bot_scene(scene_key: str, body: SceneUpdate, user=Depends(get_optional_user)):
    """Update a scene configuration (admin only)."""
    if getattr(user, "role", "user") != "admin":
        return {"error": "Admin access required"}
    sf = _get_sf()
    if not sf:
        return {"error": "Database not available"}
    async with sf() as session:
        svc = BotPersistenceService(session)
        data = body.model_dump(exclude_none=True)
        return await svc.upsert_scene(scene_key, data)


# ══════════════════════════════════════
# Preferences
# ══════════════════════════════════════

@router.get("/preferences")
async def get_bot_preferences(user=Depends(get_optional_user)):
    """Get user's bot preferences."""
    sf = _get_sf()
    if not sf:
        return {"mode": "B", "persona_id": "clawford", "bot_size": 180, "bot_enabled": True}
    async with sf() as session:
        svc = BotPersistenceService(session)
        user_id = int(user.id) if str(user.id).isdigit() else 1
        return await svc.get_preferences(user_id)


class PreferenceUpdate(BaseModel):
    mode: Optional[str] = None
    persona_id: Optional[str] = None
    position_x: Optional[float] = None
    position_y: Optional[float] = None
    bot_size: Optional[int] = None
    bot_enabled: Optional[bool] = None
    custom_personas: Optional[list] = None


@router.put("/preferences")
async def save_bot_preferences(body: PreferenceUpdate, user=Depends(get_optional_user)):
    """Save user's bot preferences."""
    sf = _get_sf()
    if not sf:
        return {"error": "Database not available"}
    async with sf() as session:
        svc = BotPersistenceService(session)
        user_id = int(user.id) if str(user.id).isdigit() else 1
        data = body.model_dump(exclude_none=True)
        return await svc.save_preferences(user_id, data)


# ══════════════════════════════════════
# Cleanup
# ══════════════════════════════════════

# ══════════════════════════════════════
# TTS (Text-to-Speech proxy)
# ══════════════════════════════════════

class TTSRequest(BaseModel):
    text: str
    provider: Optional[str] = "edge"     # browser / edge / openai
    lang: Optional[str] = "zh-CN"
    rate: Optional[float] = 1.0
    voice: Optional[str] = None


@router.post("/tts")
async def text_to_speech(body: TTSRequest, user=Depends(get_optional_user)):
    """Convert text to speech audio. Returns audio/mpeg."""
    from fastapi.responses import Response

    if body.provider == "edge":
        try:
            import edge_tts

            # Map lang to voice if not specified
            voice = body.voice
            if not voice:
                voice_map = {
                    "zh-CN": "zh-CN-XiaoxiaoNeural",
                    "zh-TW": "zh-TW-HsiaoChenNeural",
                    "en-US": "en-US-JennyNeural",
                    "en-GB": "en-GB-SoniaNeural",
                    "ja-JP": "ja-JP-NanamiNeural",
                    "ko-KR": "ko-KR-SunHiNeural",
                    "de-DE": "de-DE-KatjaNeural",
                    "fr-FR": "fr-FR-DeniseNeural",
                }
                voice = voice_map.get(body.lang or "zh-CN", "zh-CN-XiaoxiaoNeural")

            rate_str = f"{int((body.rate or 1.0) * 100 - 100):+d}%"
            communicate = edge_tts.Communicate(body.text, voice, rate=rate_str)

            audio_data = b""
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    audio_data += chunk["data"]

            return Response(content=audio_data, media_type="audio/mpeg")

        except ImportError:
            return Response(content=b"edge-tts not installed. Run: pip install edge-tts", status_code=501)
        except Exception as e:
            logger.error("Edge TTS failed", error=str(e))
            return Response(content=str(e).encode(), status_code=500)

    elif body.provider == "openai":
        try:
            from openai import AsyncOpenAI
            from app.core.config import get_settings
            settings = get_settings()

            client_ai = AsyncOpenAI(api_key=settings.openai_api_key)
            response = await client_ai.audio.speech.create(
                model="tts-1",
                voice=body.voice or "alloy",
                input=body.text,
                speed=body.rate or 1.0,
            )
            audio_data = response.content
            return Response(content=audio_data, media_type="audio/mpeg")

        except Exception as e:
            logger.error("OpenAI TTS failed", error=str(e))
            return Response(content=str(e).encode(), status_code=500)

    return Response(content=b"Unknown provider", status_code=400)


@router.get("/tts/voices")
async def list_tts_voices(provider: str = "edge", lang: str = "zh-CN"):
    """List available TTS voices for a provider."""
    if provider == "edge":
        try:
            import edge_tts
            voices = await edge_tts.list_voices()
            filtered = [v for v in voices if v.get("Locale", "").startswith(lang[:2])]
            return [{"name": v["ShortName"], "gender": v.get("Gender"), "locale": v.get("Locale")} for v in filtered]
        except ImportError:
            return {"error": "edge-tts not installed"}
    return []


@router.post("/cleanup")
async def cleanup_bot_messages(user=Depends(get_optional_user)):
    """Trigger cleanup of old bot messages (admin only)."""
    if getattr(user, "role", "user") != "admin":
        return {"error": "Admin access required"}
    sf = _get_sf()
    if not sf:
        return {"error": "Database not available"}
    async with sf() as session:
        svc = BotPersistenceService(session)
        await svc.cleanup_old_messages()
        return {"cleaned": True}


# ══════════════════════════════════════
# Stats
# ══════════════════════════════════════

@router.get("/stats")
async def get_bot_stats(user=Depends(get_optional_user)):
    """Get bot usage statistics."""
    sf = _get_sf()
    if not sf:
        return {}
    async with sf() as session:
        from sqlalchemy import text, func, select
        from app.models.bot import BotMessage

        # Total messages
        r = await session.execute(select(func.count()).select_from(BotMessage))
        total_messages = r.scalar() or 0

        # Messages by type
        r = await session.execute(
            select(BotMessage.msg_type, func.count())
            .group_by(BotMessage.msg_type)
        )
        by_type = {row[0]: row[1] for row in r}

        # Messages by direction
        r = await session.execute(
            select(BotMessage.direction, func.count())
            .group_by(BotMessage.direction)
        )
        by_direction = {row[0]: row[1] for row in r}

        # Tool calls (messages with tool_calls not null)
        r = await session.execute(
            select(func.count()).select_from(BotMessage)
            .where(BotMessage.tool_calls.isnot(None))
        )
        tool_call_count = r.scalar() or 0

        # Active users (distinct user_ids)
        r = await session.execute(
            select(func.count(func.distinct(BotMessage.user_id))).select_from(BotMessage)
        )
        active_users = r.scalar() or 0

        # Messages today
        r = await session.execute(text(
            "SELECT COUNT(*) FROM bot_messages WHERE created_at > CURRENT_DATE"
        ))
        today = r.scalar() or 0

        # Scene count
        from app.models.bot import BotScene
        r = await session.execute(select(func.count()).select_from(BotScene))
        scene_count = r.scalar() or 0

        return {
            "total_messages": total_messages,
            "messages_today": today,
            "by_type": by_type,
            "by_direction": by_direction,
            "tool_call_count": tool_call_count,
            "active_users": active_users,
            "scene_count": scene_count,
        }
