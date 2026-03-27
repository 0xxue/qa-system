"""
Admin API — Enterprise management endpoints (admin role required)

User Management:
  GET  /admin/users           → List all users
  PUT  /admin/users/:id/role  → Change user role
  DELETE /admin/users/:id     → Delete user

Audit:
  GET  /admin/audit-logs      → Query audit logs

Stats:
  GET  /admin/stats           → Usage statistics

Feedback:
  POST /admin/feedback        → Submit feedback
  GET  /admin/feedback        → List feedback (admin)
"""

import structlog
from fastapi import APIRouter, Depends, Query, HTTPException
from typing import Optional
from sqlalchemy import text

from app.middleware.rbac import require_role
from app.services.auth import get_current_user
from app.services.database import _session_factory

router = APIRouter()
logger = structlog.get_logger()


# ========== User Management (Admin) ==========

@router.get("/users")
async def list_users(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    admin=Depends(require_role("admin")),
):
    """List all users. Admin only."""
    if not _session_factory:
        return []
    async with _session_factory() as session:
        result = await session.execute(
            text("SELECT id, username, email, role, department, created_at FROM users ORDER BY id LIMIT :l OFFSET :o"),
            {"l": limit, "o": offset},
        )
        users = [dict(row) for row in result.mappings().all()]

        count_result = await session.execute(text("SELECT COUNT(*) FROM users"))
        total = count_result.scalar()

    return {"total": total, "users": users}


@router.put("/users/{user_id}/role")
async def change_user_role(
    user_id: int,
    role: str = Query(..., regex="^(admin|user|readonly)$"),
    admin=Depends(require_role("admin")),
):
    """Change a user's role. Admin only."""
    if not _session_factory:
        raise HTTPException(status_code=503, detail="Database not available")

    async with _session_factory() as session:
        result = await session.execute(
            text("SELECT id, username FROM users WHERE id = :id"),
            {"id": user_id},
        )
        user = result.mappings().first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        await session.execute(
            text("UPDATE users SET role = :role WHERE id = :id"),
            {"role": role, "id": user_id},
        )
        await session.commit()

    logger.info("User role changed", user_id=user_id, new_role=role, by=admin.id)
    return {"message": f"User {user['username']} role changed to {role}"}


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    admin=Depends(require_role("admin")),
):
    """Delete a user. Admin only. Cannot delete yourself."""
    if str(user_id) == str(admin.id):
        raise HTTPException(status_code=400, detail="Cannot delete yourself")

    if not _session_factory:
        raise HTTPException(status_code=503, detail="Database not available")

    async with _session_factory() as session:
        result = await session.execute(
            text("SELECT id FROM users WHERE id = :id"),
            {"id": user_id},
        )
        if not result.scalar():
            raise HTTPException(status_code=404, detail="User not found")

        await session.execute(text("DELETE FROM users WHERE id = :id"), {"id": user_id})
        await session.commit()

    logger.info("User deleted", user_id=user_id, by=admin.id)
    return {"message": "User deleted"}


# ========== Audit Logs ==========

@router.get("/audit-logs")
async def list_audit_logs(
    user_id: Optional[int] = Query(None),
    action: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    admin=Depends(require_role("admin")),
):
    """Query audit logs. Admin only."""
    if not _session_factory:
        return {"total": 0, "logs": []}

    async with _session_factory() as session:
        where = "WHERE 1=1"
        params: dict = {"l": limit, "o": offset}
        if user_id:
            where += " AND user_id = :uid"
            params["uid"] = user_id
        if action:
            where += " AND action = :action"
            params["action"] = action

        result = await session.execute(
            text(f"SELECT * FROM audit_logs {where} ORDER BY created_at DESC LIMIT :l OFFSET :o"),
            params,
        )
        logs = [dict(row) for row in result.mappings().all()]

        count_result = await session.execute(
            text(f"SELECT COUNT(*) FROM audit_logs {where}"),
            params,
        )
        total = count_result.scalar()

    return {"total": total, "logs": logs}


# ========== Usage Statistics ==========

@router.get("/stats")
async def usage_stats(admin=Depends(require_role("admin"))):
    """Aggregated usage statistics. Admin only."""
    if not _session_factory:
        return {}

    async with _session_factory() as session:
        stats = {}
        for table, key in [
            ("users", "total_users"),
            ("conversations", "total_conversations"),
            ("messages", "total_messages"),
            ("kb_documents", "total_documents"),
            ("kb_collections", "total_collections"),
            ("feedback", "total_feedback"),
            ("audit_logs", "total_audit_logs"),
        ]:
            result = await session.execute(text(f"SELECT COUNT(*) FROM {table}"))
            stats[key] = result.scalar() or 0

        # Messages by role
        result = await session.execute(
            text("SELECT role, COUNT(*) as cnt FROM messages GROUP BY role")
        )
        stats["messages_by_role"] = {row["role"]: row["cnt"] for row in result.mappings().all()}

        # Top users
        result = await session.execute(text(
            "SELECT u.username, COUNT(c.id) as conv_count "
            "FROM users u LEFT JOIN conversations c ON u.id = c.user_id "
            "GROUP BY u.username ORDER BY conv_count DESC LIMIT 10"
        ))
        stats["top_users"] = [dict(row) for row in result.mappings().all()]

    return stats


# ========== Feedback ==========

@router.post("/feedback")
async def submit_feedback(
    message_id: int,
    rating: int,
    comment: str = "",
    user=Depends(get_current_user),
):
    """Submit feedback on a QA answer. Any authenticated user."""
    if not _session_factory:
        return {"status": "ok"}

    async with _session_factory() as session:
        await session.execute(
            text("INSERT INTO feedback (message_id, user_id, rating, comment) VALUES (:m, :u, :r, :c)"),
            {"m": message_id, "u": int(user.id), "r": rating, "c": comment},
        )
        await session.commit()

    logger.info("Feedback submitted", message_id=message_id, rating=rating, user_id=user.id)
    return {"status": "ok"}


@router.get("/feedback")
async def list_feedback(
    limit: int = Query(50),
    admin=Depends(require_role("admin")),
):
    """List all feedback. Admin only."""
    if not _session_factory:
        return {"total": 0, "feedback": []}

    async with _session_factory() as session:
        result = await session.execute(
            text("SELECT f.*, u.username FROM feedback f JOIN users u ON f.user_id = u.id ORDER BY f.created_at DESC LIMIT :l"),
            {"l": limit},
        )
        items = [dict(row) for row in result.mappings().all()]
        count_result = await session.execute(text("SELECT COUNT(*) FROM feedback"))
        total = count_result.scalar()

    return {"total": total, "feedback": items}
