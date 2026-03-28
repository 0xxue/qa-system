"""
WebSocket Connection Manager

Manages per-user WebSocket connections for real-time Bot communication.
Supports: connect, disconnect, push to user, broadcast, heartbeat.

Can be used standalone or as part of the qa-system.
"""

import asyncio
import structlog
from typing import Optional
from fastapi import WebSocket
from datetime import datetime

logger = structlog.get_logger()


class ConnectionState:
    """State for a single WebSocket connection."""

    def __init__(self, ws: WebSocket, user_id: str, role: str = "user"):
        self.ws = ws
        self.user_id = user_id
        self.role = role
        self.connected_at = datetime.utcnow()
        self.last_active = datetime.utcnow()
        self.mode = "B"  # Default: assistant mode


class BotWebSocketManager:
    """
    Manages all active WebSocket connections.

    Usage:
        manager = BotWebSocketManager()
        await manager.connect(user_id, role, websocket)
        await manager.push(user_id, {"type": "bot_message", "content": "Hello!"})
        await manager.disconnect(user_id)
    """

    def __init__(self):
        self.connections: dict[str, ConnectionState] = {}

    async def connect(self, user_id: str, role: str, ws: WebSocket) -> ConnectionState:
        """Accept and register a new WebSocket connection."""
        # Close existing connection for this user (only 1 active per user)
        if user_id in self.connections:
            await self.disconnect(user_id)

        await ws.accept()
        state = ConnectionState(ws, user_id, role)
        self.connections[user_id] = state
        logger.info("Bot WS connected", user_id=user_id, role=role, total=len(self.connections))
        return state

    async def disconnect(self, user_id: str):
        """Remove and close a connection."""
        state = self.connections.pop(user_id, None)
        if state:
            try:
                await state.ws.close()
            except Exception:
                pass
            logger.info("Bot WS disconnected", user_id=user_id, total=len(self.connections))

    async def push(self, user_id: str, message: dict) -> bool:
        """Send a message to a specific user. Returns False if not connected."""
        state = self.connections.get(user_id)
        if not state:
            return False
        try:
            await state.ws.send_json(message)
            state.last_active = datetime.utcnow()
            return True
        except Exception as e:
            logger.warning("Bot WS push failed", user_id=user_id, error=str(e))
            await self.disconnect(user_id)
            return False

    async def broadcast(self, message: dict, min_role: str = None):
        """Send a message to all connected users (optionally filtered by role)."""
        role_levels = {"readonly": 1, "user": 2, "admin": 3}
        min_level = role_levels.get(min_role, 0)

        for user_id, state in list(self.connections.items()):
            if min_level and role_levels.get(state.role, 0) < min_level:
                continue
            await self.push(user_id, message)

    def get_connection(self, user_id: str) -> Optional[ConnectionState]:
        return self.connections.get(user_id)

    def get_mode(self, user_id: str) -> str:
        state = self.connections.get(user_id)
        return state.mode if state else "B"

    def set_mode(self, user_id: str, mode: str):
        state = self.connections.get(user_id)
        if state:
            state.mode = mode

    @property
    def online_count(self) -> int:
        return len(self.connections)

    @property
    def online_users(self) -> list[str]:
        return list(self.connections.keys())


# Singleton instance
bot_ws_manager = BotWebSocketManager()
