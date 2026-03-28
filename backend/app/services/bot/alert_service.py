"""
Alert Service — Background scheduled checks + proactive WebSocket push

Runs in the background, periodically checks:
1. System health (DB, Redis)
2. Data anomalies (unusual spikes/drops)
3. Expiring items
4. Custom alerts (user-defined thresholds)

When an alert triggers → push to all connected users via WebSocket.
Respects user mode (A=all, B=medium+, C=critical only).

For external integration:
    from app.services.bot.alert_service import alert_manager
    alert_manager.register_check("inventory_low", my_check_fn, interval=300, priority="high")
"""

import asyncio
import structlog
from datetime import datetime
from typing import Optional, Callable, Awaitable

from app.services.bot.ws_manager import bot_ws_manager

logger = structlog.get_logger()


# Priority levels for mode filtering
PRIORITY_LEVELS = {"low": 1, "medium": 2, "high": 3, "critical": 4}
MODE_THRESHOLDS = {"A": 0, "B": 2, "C": 4}


class AlertCheck:
    """A registered periodic check."""
    def __init__(self, name: str, handler: Callable[[], Awaitable[Optional[dict]]], interval: int, priority: str):
        self.name = name
        self.handler = handler
        self.interval = interval  # seconds
        self.priority = priority
        self.last_run = None
        self.last_alert = None  # Avoid spamming same alert
        self.enabled = True


class AlertManager:
    """Manages all background alert checks."""

    def __init__(self):
        self.checks: dict[str, AlertCheck] = {}
        self._running = False
        self._task: Optional[asyncio.Task] = None

    def register_check(
        self,
        name: str,
        handler: Callable[[], Awaitable[Optional[dict]]],
        interval: int = 300,
        priority: str = "medium",
    ):
        """
        Register a periodic check.

        Args:
            name: Unique check name
            handler: Async function that returns alert dict or None
                     Alert dict: {"message": "...", "detail": "...", "emotion": "surprised"}
            interval: Check interval in seconds
            priority: "low" / "medium" / "high" / "critical"
        """
        self.checks[name] = AlertCheck(name, handler, interval, priority)
        logger.info("Alert check registered", name=name, interval=interval, priority=priority)

    def unregister_check(self, name: str):
        self.checks.pop(name, None)

    async def start(self):
        """Start the background alert loop."""
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._loop())
        logger.info("Alert service started", checks=len(self.checks))

    async def stop(self):
        self._running = False
        if self._task:
            self._task.cancel()

    async def _loop(self):
        """Main loop: check each registered check on its interval."""
        while self._running:
            now = datetime.utcnow()

            for check in list(self.checks.values()):
                if not check.enabled:
                    continue

                # Check if it's time to run
                if check.last_run:
                    elapsed = (now - check.last_run).total_seconds()
                    if elapsed < check.interval:
                        continue

                check.last_run = now

                try:
                    result = await check.handler()
                    if result and result.get("message"):
                        # Avoid spamming the same alert
                        alert_key = f"{check.name}:{result['message'][:50]}"
                        if alert_key == check.last_alert:
                            continue
                        check.last_alert = alert_key

                        await self._push_alert(check, result)
                except Exception as e:
                    logger.warning("Alert check failed", check=check.name, error=str(e))

            await asyncio.sleep(10)  # Poll every 10 seconds

    async def _push_alert(self, check: AlertCheck, alert: dict):
        """Push alert to all connected users (filtered by mode)."""
        message = {
            "type": "bot_alert",
            "content": alert["message"],
            "detail": alert.get("detail", ""),
            "emotion": alert.get("emotion", "surprised"),
            "action": alert.get("action"),
            "priority": check.priority,
            "check_name": check.name,
            "timestamp": datetime.utcnow().isoformat(),
        }

        priority_level = PRIORITY_LEVELS.get(check.priority, 2)

        # Push to each connected user (respecting their mode)
        for user_id in bot_ws_manager.online_users:
            user_mode = bot_ws_manager.get_mode(user_id)
            threshold = MODE_THRESHOLDS.get(user_mode, 2)

            if priority_level >= threshold:
                await bot_ws_manager.push(user_id, message)
                logger.info("Alert pushed", check=check.name, user_id=user_id, priority=check.priority)


# Singleton
alert_manager = AlertManager()


# ══════════════════════════════════════
# Built-in Alert Checks
# ══════════════════════════════════════

async def check_system_health() -> Optional[dict]:
    """Check DB and Redis health."""
    try:
        from app.services.database import check_db
        from app.services.cache import check_redis

        db_ok = await check_db()
        redis_ok = await check_redis()

        if not db_ok:
            return {"message": "⚠️ Database connection lost!", "emotion": "angry", "action": "wave"}
        if not redis_ok:
            return {"message": "⚠️ Redis connection lost! Cache may be stale.", "emotion": "surprised"}
    except Exception as e:
        return {"message": f"⚠️ Health check error: {str(e)[:100]}", "emotion": "angry"}

    return None


async def check_data_anomaly() -> Optional[dict]:
    """Check for unusual data patterns."""
    try:
        from sqlalchemy import text

        def _get_sf():
            from app.services.database import _session_factory
            return _session_factory

        sf = _get_sf()
        if not sf:
            return None

        async with sf() as session:
            # Check if conversations spiked (more than 10 in last hour)
            result = await session.execute(text(
                "SELECT COUNT(*) FROM conversations WHERE created_at > NOW() - INTERVAL '1 hour'"
            ))
            recent = result.scalar() or 0

            if recent > 10:
                return {
                    "message": f"📈 Activity spike! {recent} new conversations in the last hour.",
                    "emotion": "surprised",
                    "detail": f"{recent} conversations created recently",
                }

            # Check if any errors in recent messages
            result = await session.execute(text(
                "SELECT COUNT(*) FROM messages WHERE content LIKE '%error%' AND created_at > NOW() - INTERVAL '30 minutes'"
            ))
            errors = result.scalar() or 0

            if errors > 3:
                return {
                    "message": f"⚠️ {errors} error messages in the last 30 minutes. Something might be wrong.",
                    "emotion": "angry",
                }

    except Exception:
        pass

    return None


async def check_system_stats() -> Optional[dict]:
    """Periodic stats summary (friendly, not alarming)."""
    try:
        from sqlalchemy import text

        def _get_sf():
            from app.services.database import _session_factory
            return _session_factory

        sf = _get_sf()
        if not sf:
            return None

        async with sf() as session:
            stats = {}
            for table, key in [("users", "users"), ("conversations", "convs"), ("messages", "msgs")]:
                result = await session.execute(text(f"SELECT COUNT(*) FROM {table}"))
                stats[key] = result.scalar() or 0

            return {
                "message": f"📊 System update: {stats['users']} users, {stats['convs']} conversations, {stats['msgs']} messages.",
                "emotion": "happy",
            }
    except Exception:
        pass

    return None


async def cleanup_bot_messages() -> Optional[dict]:
    """Periodically clean up bot messages older than 30 days."""
    try:
        def _get_sf():
            from app.services.database import _session_factory
            return _session_factory

        sf = _get_sf()
        if not sf:
            return None

        async with sf() as session:
            from app.services.bot.persistence import BotPersistenceService
            svc = BotPersistenceService(session)
            await svc.cleanup_old_messages()

    except Exception as e:
        logger.warning("Bot message cleanup failed", error=str(e))

    return None  # Silent task, no alert


def register_builtin_checks():
    """Register default alert checks."""
    alert_manager.register_check("health", check_system_health, interval=60, priority="critical")
    alert_manager.register_check("anomaly", check_data_anomaly, interval=120, priority="high")
    alert_manager.register_check("stats_summary", check_system_stats, interval=600, priority="low")
    alert_manager.register_check("bot_cleanup", cleanup_bot_messages, interval=3600, priority="low")
    logger.info("Built-in alert checks registered", count=4)
