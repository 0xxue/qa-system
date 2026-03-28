"""
WebSocket Endpoint for AI Bot

WS /ws/bot?token=<jwt>

Protocol:
  Client → Server:
    {"type": "chat", "message": "..."}
    {"type": "scene", "scene": "page:dashboard"}
    {"type": "mode_change", "mode": "A"}
    {"type": "poke"}
    {"type": "ping"}

  Server → Client:
    {"type": "connected", "mode": "B", "user": {...}}
    {"type": "bot_message", "content": "...", "emotion": "happy", "action": "nod"}
    {"type": "bot_emotion", "emotion": "thinking"}
    {"type": "bot_action", "action": "wave"}
    {"type": "pong"}
    {"type": "error", "message": "..."}
"""

import json
import random
import structlog
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query

from app.services.bot.ws_manager import bot_ws_manager
from app.services.bot.brain import think as bot_think
from app.services.bot.emotion import get_emotion

logger = structlog.get_logger()
router = APIRouter()

# Poke responses
POKE_RESPONSES = [
    "Hey, stop poking! 😤",
    "That tickles! 😂",
    "What are you doing? 🤔",
    "One more poke and I quit!",
    "Okay fine, poke away~",
    "I'm working here! 📊",
    "Boop! 👆",
]

# Idle phrases
IDLE_PHRASES = [
    "Standing by~ ✦",
    "Ask me anything!",
    "Need help with something?",
    "I can check data, create KBs, or just chat 💬",
    "All systems nominal ✓",
]

# Scene templates (basic — can be moved to DB later)
SCENE_TEMPLATES = {
    "login": {"speech": "Welcome back! Let me check today's updates...", "emotion": "happy", "action": "wave"},
    "page:chat": {"speech": "Chat mode! Ask me anything ▶", "emotion": "happy"},
    "page:kb": {"speech": "Knowledge base! Upload docs or search here ◈", "emotion": "idle"},
    "page:dashboard": {"speech": "Dashboard loading... Let me check the numbers 📊", "emotion": "thinking"},
    "page:settings": {"speech": "Settings! You can customize me here ⚙", "emotion": "idle"},
}


def _decode_token(token: str):
    """Decode JWT token to get user info."""
    from jose import jwt, JWTError
    from app.core.config import get_settings
    from types import SimpleNamespace

    if not token:
        return SimpleNamespace(id="1", role="user", username="demo")

    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        user_id = payload.get("sub", "1")
        role = payload.get("role", "user")

        # Load username from DB
        from app.services.auth import _load_user_from_db
        import asyncio
        # Can't await here, use sync fallback
        return SimpleNamespace(id=user_id, role=role, username=f"user_{user_id}")
    except JWTError:
        return SimpleNamespace(id="1", role="user", username="demo")


@router.websocket("/ws/bot")
async def bot_websocket(ws: WebSocket, token: str = Query(default="")):
    """Main Bot WebSocket endpoint."""

    # Authenticate
    user = _decode_token(token)
    user_id = str(user.id)

    # Connect
    state = await bot_ws_manager.connect(user_id, user.role, ws)

    # Send connected message
    await bot_ws_manager.push(user_id, {
        "type": "connected",
        "mode": state.mode,
        "user": {"id": user.id, "role": user.role, "username": user.username},
    })

    try:
        while True:
            # Receive message
            data = await ws.receive_json()
            msg_type = data.get("type", "")

            if msg_type == "ping":
                await bot_ws_manager.push(user_id, {"type": "pong"})

            elif msg_type == "chat":
                message = data.get("message", "").strip()
                if not message:
                    continue

                # Show thinking emotion
                await bot_ws_manager.push(user_id, {"type": "bot_emotion", "emotion": "thinking"})

                # Bot thinks (LLM Agent loop)
                context = {"page": data.get("page"), "mode": state.mode}
                response = await bot_think(message, user, context)

                # Send response
                await bot_ws_manager.push(user_id, {
                    "type": "bot_message",
                    "content": response.content,
                    "emotion": response.emotion,
                    "action": response.action,
                    "tool_calls": [{"tool": tc["tool"], "success": not tc["result"].get("error")} for tc in response.tool_calls],
                })

            elif msg_type == "scene":
                scene = data.get("scene", "")
                template = SCENE_TEMPLATES.get(scene, {})
                if template:
                    await bot_ws_manager.push(user_id, {
                        "type": "bot_message",
                        "content": template.get("speech", ""),
                        "emotion": template.get("emotion", "idle"),
                        "action": template.get("action"),
                        "scene": scene,
                    })

            elif msg_type == "mode_change":
                new_mode = data.get("mode", "B")
                if new_mode in ("A", "B", "C"):
                    bot_ws_manager.set_mode(user_id, new_mode)
                    await bot_ws_manager.push(user_id, {
                        "type": "mode_config",
                        "mode": new_mode,
                    })

            elif msg_type == "poke":
                phrase = random.choice(POKE_RESPONSES)
                await bot_ws_manager.push(user_id, {
                    "type": "bot_message",
                    "content": phrase,
                    "emotion": "surprised",
                })

            elif msg_type == "idle":
                # Only respond in companion mode
                if state.mode == "A":
                    phrase = random.choice(IDLE_PHRASES)
                    await bot_ws_manager.push(user_id, {
                        "type": "bot_message",
                        "content": phrase,
                        "emotion": "idle",
                    })

    except WebSocketDisconnect:
        await bot_ws_manager.disconnect(user_id)
    except Exception as e:
        logger.error("Bot WS error", user_id=user_id, error=str(e))
        await bot_ws_manager.disconnect(user_id)
