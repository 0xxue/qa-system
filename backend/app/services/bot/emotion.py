"""
Bot Emotion Engine

Maps context, events, and tool results to emotion states and actions.
The frontend BotPlugin renders the corresponding VRM expression.

Emotions: idle, happy, angry, sad, thinking, talking, surprised
Actions: wave, nod, think
"""

from typing import Optional


# Context → emotion mapping rules
EMOTION_RULES = {
    # System events
    "login": {"emotion": "happy", "action": "wave"},
    "logout": {"emotion": "sad"},
    "page_change": {"emotion": "idle"},
    "error": {"emotion": "angry"},
    "anomaly_detected": {"emotion": "surprised"},

    # QA flow
    "query_received": {"emotion": "thinking", "action": "think"},
    "searching": {"emotion": "thinking"},
    "analyzing": {"emotion": "thinking"},
    "streaming": {"emotion": "talking"},
    "answer_complete": {"emotion": "happy", "action": "nod"},
    "answer_failed": {"emotion": "sad"},

    # Tool results
    "tool_success": {"emotion": "happy", "action": "nod"},
    "tool_failed": {"emotion": "sad"},
    "tool_processing": {"emotion": "thinking"},

    # User interaction
    "user_poke": {"emotion": "surprised"},
    "user_drag": {"emotion": "surprised"},
    "user_feedback_positive": {"emotion": "happy"},
    "user_feedback_negative": {"emotion": "sad"},
    "idle": {"emotion": "idle"},
}


def get_emotion(event: str, tool_result: dict = None) -> dict:
    """
    Determine emotion and action for a given event.

    Args:
        event: Event name (e.g., "tool_success", "login", "query_received")
        tool_result: Optional tool execution result (may override emotion)

    Returns:
        {"emotion": "happy", "action": "nod"} or {"emotion": "thinking"}
    """
    # Check tool result for explicit emotion override
    if tool_result:
        if tool_result.get("error"):
            return {"emotion": "sad"}
        if tool_result.get("emotion"):
            result = {"emotion": tool_result["emotion"]}
            if tool_result.get("action"):
                result["action"] = tool_result["action"]
            return result

    # Lookup from rules
    rule = EMOTION_RULES.get(event, {"emotion": "idle"})
    return dict(rule)


def get_emotion_for_content(content: str) -> dict:
    """Infer emotion from response text content."""
    content_lower = content.lower()

    if any(w in content_lower for w in ["error", "failed", "sorry", "cannot", "unable", "抱歉", "失败", "无法"]):
        return {"emotion": "sad"}
    if any(w in content_lower for w in ["done", "created", "success", "completed", "搞定", "成功", "已创建", "已删除"]):
        return {"emotion": "happy", "action": "nod"}
    if any(w in content_lower for w in ["warning", "alert", "anomaly", "⚠", "警告", "异常", "注意"]):
        return {"emotion": "surprised"}
    if any(w in content_lower for w in ["?", "？", "think", "analyzing", "分析", "思考"]):
        return {"emotion": "thinking"}

    return {"emotion": "happy"}
