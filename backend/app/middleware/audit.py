"""
Audit Log — Records all user actions to PostgreSQL

Every QA question, KB upload, login, etc. is logged with:
- Who (user_id)
- What (action, query)
- Result (answer preview, confidence)
- Context (model used, tokens, IP)
"""

import structlog
from typing import Optional

logger = structlog.get_logger()


async def log_audit(
    user_id,
    action: str,
    query: str = "",
    answer_preview: str = "",
    model_used: str = "",
    tokens_consumed: int = 0,
    confidence: float = 0,
    ip_address: str = "",
):
    """Record an audit log entry to database."""
    from app.services.database import _session_factory
    from sqlalchemy import text

    if not _session_factory:
        logger.info("Audit (no DB)", action=action, user_id=user_id)
        return

    try:
        async with _session_factory() as session:
            await session.execute(
                text(
                    "INSERT INTO audit_logs (user_id, action, query, answer_preview, model_used, tokens_consumed, confidence, ip_address) "
                    "VALUES (:uid, :action, :query, :preview, :model, :tokens, :conf, :ip)"
                ),
                {
                    "uid": int(user_id) if str(user_id).isdigit() else None,
                    "action": action,
                    "query": query[:2000],
                    "preview": answer_preview[:500],
                    "model": model_used,
                    "tokens": tokens_consumed,
                    "conf": round(confidence, 2) if confidence else 0,
                    "ip": ip_address,
                },
            )
            await session.commit()
    except Exception as e:
        logger.warning("Audit log failed", error=str(e), action=action)
