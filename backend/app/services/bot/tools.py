"""
Bot Tools — System operations the AI Bot can execute.

Each tool:
1. Has a name, description, and parameters (for LLM function calling)
2. Has a handler function that calls the real backend API
3. Has optional role requirements and emotion mapping
4. Can be registered dynamically for external integrations

Usage:
    result = await execute_tool("get_system_stats", {}, user)
    tools_for_llm = get_tool_definitions(user_role="admin")
"""

import json
import structlog
from typing import Any
from datetime import datetime

logger = structlog.get_logger()


# ══════════════════════════════════════
# Tool Registry
# ══════════════════════════════════════

_tools: dict[str, dict] = {}


def register_tool(
    name: str,
    description: str,
    handler,
    parameters: dict = None,
    requires_role: str = None,
    emotion_on_success: str = None,
    action_on_success: str = None,
    confirm_before: bool = False,
):
    """Register a tool that the Bot can use."""
    _tools[name] = {
        "name": name,
        "description": description,
        "parameters": parameters or {},
        "handler": handler,
        "requires_role": requires_role,
        "emotion_on_success": emotion_on_success,
        "action_on_success": action_on_success,
        "confirm_before": confirm_before,
    }


def get_tool_definitions(user_role: str = "user") -> list[dict]:
    """Get OpenAI-compatible tool definitions filtered by user role."""
    role_levels = {"readonly": 1, "user": 2, "admin": 3}
    user_level = role_levels.get(user_role, 2)

    defs = []
    for tool in _tools.values():
        required_level = role_levels.get(tool["requires_role"], 0)
        if user_level < required_level:
            continue

        # Convert to OpenAI function calling format
        properties = {}
        required = []
        for param_name, param_def in tool["parameters"].items():
            prop = {"type": param_def.get("type", "string")}
            if "description" in param_def:
                prop["description"] = param_def["description"]
            if "enum" in param_def:
                prop["enum"] = param_def["enum"]
            properties[param_name] = prop
            if param_def.get("required"):
                required.append(param_name)

        defs.append({
            "type": "function",
            "function": {
                "name": tool["name"],
                "description": tool["description"],
                "parameters": {
                    "type": "object",
                    "properties": properties,
                    "required": required,
                },
            },
        })

    return defs


async def execute_tool(name: str, args: dict, user) -> dict:
    """Execute a tool and return the result."""
    tool = _tools.get(name)
    if not tool:
        return {"error": f"Unknown tool: {name}"}

    # RBAC check
    if tool["requires_role"]:
        role_levels = {"readonly": 1, "user": 2, "admin": 3}
        if role_levels.get(getattr(user, "role", "user"), 2) < role_levels.get(tool["requires_role"], 0):
            return {"error": f"Permission denied. Requires {tool['requires_role']} role."}

    try:
        result = await tool["handler"](**args)
        logger.info("Bot tool executed", tool=name, args=args, success=True)
        return {"success": True, "data": result, "emotion": tool["emotion_on_success"], "action": tool["action_on_success"]}
    except Exception as e:
        logger.error("Bot tool failed", tool=name, error=str(e))
        return {"error": str(e)}


def get_tool_meta(name: str) -> dict:
    """Get tool metadata (for emotion/action mapping)."""
    return _tools.get(name, {})


# ══════════════════════════════════════
# Built-in Tool Handlers
# ══════════════════════════════════════

def _get_sf():
    from app.services.database import _session_factory
    return _session_factory


# ── Data Tools ──

async def _get_system_stats():
    from sqlalchemy import text
    sf = _get_sf()
    if not sf:
        return {"error": "Database not available"}
    stats = {}
    async with sf() as session:
        for table, key in [("users", "total_users"), ("conversations", "total_conversations"),
                           ("messages", "total_messages"), ("kb_documents", "total_documents"),
                           ("kb_collections", "total_collections")]:
            result = await session.execute(text(f"SELECT COUNT(*) FROM {table}"))
            stats[key] = result.scalar() or 0
    return stats


async def _get_metrics_summary(period: str = "daily"):
    from app.services.data_service import DataService
    svc = DataService()
    return await svc.get_summary_metrics(period)


async def _get_user_stats():
    from app.services.data_service import DataService
    svc = DataService()
    return await svc.get_user_stats()


async def _get_expiring_items(date: str = "today"):
    from app.services.data_service import DataService
    svc = DataService()
    return await svc.get_items_expiring(date)


# ── KB Tools ──

async def _create_kb_collection(name: str, description: str = "", category: str = "general"):
    from sqlalchemy import text
    sf = _get_sf()
    if not sf:
        return {"error": "Database not available"}
    async with sf() as session:
        result = await session.execute(
            text("INSERT INTO kb_collections (name, description, category, owner_id) VALUES (:n, :d, :c, 1) RETURNING id, name"),
            {"n": name, "d": description, "c": category},
        )
        row = result.mappings().first()
        await session.commit()
        return dict(row) if row else {"error": "Failed to create"}


async def _list_kb_collections():
    from sqlalchemy import text
    sf = _get_sf()
    if not sf:
        return []
    async with sf() as session:
        result = await session.execute(text("SELECT id, name, description, doc_count, category FROM kb_collections ORDER BY id"))
        return [dict(r) for r in result.mappings().all()]


async def _search_kb(query: str):
    from app.services.kb_service import KnowledgeBaseService
    svc = KnowledgeBaseService()
    results = await svc.search(query, top_k=3)
    return [{"content": r["content"][:200], "similarity": r["similarity"], "metadata": r.get("metadata", {})} for r in results]


# ── Conversation Tools ──

async def _list_conversations():
    from sqlalchemy import text
    sf = _get_sf()
    if not sf:
        return []
    async with sf() as session:
        result = await session.execute(text("SELECT id, title, message_count, created_at FROM conversations ORDER BY updated_at DESC LIMIT 10"))
        return [dict(r) for r in result.mappings().all()]


async def _delete_conversation(conversation_id: int):
    from sqlalchemy import text
    sf = _get_sf()
    if not sf:
        return {"error": "Database not available"}
    async with sf() as session:
        result = await session.execute(text("DELETE FROM conversations WHERE id = :id RETURNING id"), {"id": conversation_id})
        deleted = result.scalar()
        await session.commit()
        return {"deleted": bool(deleted), "id": conversation_id}


async def _ask_qa(query: str):
    """Ask the full QA system (LangGraph pipeline)."""
    from app.core.langgraph.graph import qa_graph
    import uuid
    config = {"configurable": {"thread_id": str(uuid.uuid4())}}
    result = await qa_graph.ainvoke({"query": query, "user_id": "bot", "conversation_id": None}, config=config)
    return {"answer": result.get("answer", ""), "confidence": result.get("confidence", 0), "sources": result.get("sources", [])}


# ── Admin Tools ──

async def _list_users():
    from sqlalchemy import text
    sf = _get_sf()
    if not sf:
        return []
    async with sf() as session:
        result = await session.execute(text("SELECT id, username, role, email FROM users ORDER BY id"))
        return [dict(r) for r in result.mappings().all()]


async def _change_user_role(username: str, role: str):
    from sqlalchemy import text
    sf = _get_sf()
    if not sf:
        return {"error": "Database not available"}
    async with sf() as session:
        result = await session.execute(
            text("UPDATE users SET role = :r WHERE username = :u RETURNING id, username, role"),
            {"r": role, "u": username},
        )
        row = result.mappings().first()
        await session.commit()
        return dict(row) if row else {"error": f"User '{username}' not found"}


# ── System Tools ──

async def _health_check():
    from app.services.database import check_db
    from app.services.cache import check_redis
    db_ok = await check_db()
    redis_ok = await check_redis()
    return {"database": "healthy" if db_ok else "unhealthy", "redis": "healthy" if redis_ok else "unhealthy", "status": "ok" if (db_ok and redis_ok) else "degraded"}


# ══════════════════════════════════════
# Register All Built-in Tools
# ══════════════════════════════════════

def _register_builtin_tools():
    # Data
    register_tool("get_system_stats", "Get system statistics: users, conversations, messages, documents count", _get_system_stats, emotion_on_success="happy")
    register_tool("get_metrics_summary", "Get business metrics: revenue, costs, profit, budget, runway", _get_metrics_summary,
                   parameters={"period": {"type": "string", "enum": ["daily", "weekly", "monthly"]}}, emotion_on_success="happy")
    register_tool("get_user_stats", "Get user statistics: total, active, retention, growth", _get_user_stats)
    register_tool("get_expiring_items", "Get items expiring on a date", _get_expiring_items,
                   parameters={"date": {"type": "string", "description": "Date: 'today', 'tomorrow', or YYYY-MM-DD"}})

    # KB
    register_tool("create_kb_collection", "Create a new knowledge base collection", _create_kb_collection,
                   parameters={"name": {"type": "string", "required": True}, "description": {"type": "string"}, "category": {"type": "string", "enum": ["general", "hr", "product", "technical", "policy", "finance"]}},
                   emotion_on_success="happy", action_on_success="nod")
    register_tool("list_kb_collections", "List all knowledge base collections", _list_kb_collections)
    register_tool("search_knowledge_base", "Search uploaded documents in knowledge base", _search_kb,
                   parameters={"query": {"type": "string", "required": True}})

    # Conversations
    register_tool("list_conversations", "List recent conversations", _list_conversations)
    register_tool("delete_conversation", "Delete a conversation by ID", _delete_conversation,
                   parameters={"conversation_id": {"type": "integer", "required": True}},
                   confirm_before=True, emotion_on_success="idle", action_on_success="nod")

    # QA
    register_tool("ask_qa_system", "Ask the AI QA system a question (full analysis with data)", _ask_qa,
                   parameters={"query": {"type": "string", "required": True}}, emotion_on_success="happy")

    # Admin
    register_tool("list_users", "List all users (admin only)", _list_users, requires_role="admin")
    register_tool("change_user_role", "Change a user's role (admin only)", _change_user_role,
                   parameters={"username": {"type": "string", "required": True}, "role": {"type": "string", "enum": ["admin", "user", "readonly"], "required": True}},
                   requires_role="admin", confirm_before=True, emotion_on_success="happy", action_on_success="nod")

    # System
    register_tool("health_check", "Check system health: database, redis status", _health_check)

    logger.info("Bot tools registered", count=len(_tools))


# Auto-register on import
_register_builtin_tools()
