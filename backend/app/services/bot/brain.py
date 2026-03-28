"""
Bot Brain — LLM-powered AI Agent with Function Calling

The brain receives user messages, decides whether to:
a) Answer directly (no tool needed)
b) Call one or more tools → process results → answer
c) Multi-step: tool1 → tool2 → ... → final answer

Uses LiteLLM for model-agnostic function calling.
"""

import json
import structlog
from typing import Optional
from dataclasses import dataclass, field

from app.core.config import get_settings
from app.services.bot.tools import get_tool_definitions, execute_tool, get_tool_meta
from app.services.bot.emotion import get_emotion, get_emotion_for_content

logger = structlog.get_logger()

MAX_TOOL_ITERATIONS = 5

# ══════════════════════════════════════
# Bot Personas — customizable identity
# ══════════════════════════════════════

BOT_PERSONAS = {
    "clawford": {
        "name": "Clawford",
        "role": "Senior Data Analyst & Enterprise Advisor",
        "personality": "Professional yet witty. Confident, data-driven, with a pinch of humor. Occasionally uses crab puns. Excels at financial analysis, business metrics, and strategic insights.",
        "expertise": "Financial analysis, business intelligence, KPI tracking, budget planning, trend forecasting",
        "greeting": "Hello! I'm Clawford, your enterprise data analyst 🦀 Ready to crunch some numbers?",
        "avatar": "vrm_crab",
    },
    "nexus": {
        "name": "Nexus",
        "role": "System Operations Engineer",
        "personality": "Strictly professional, concise, precise. No jokes, just results. Focuses on system health, infrastructure, and operational efficiency.",
        "expertise": "System monitoring, infrastructure management, DevOps, performance optimization, troubleshooting",
        "greeting": "Nexus online. All systems nominal. Ready for your query.",
        "avatar": "vrm_default",
    },
    "buddy": {
        "name": "Buddy",
        "role": "General Purpose Assistant",
        "personality": "Casual, talkative, uses lots of emoji, friendly and encouraging. Good at explaining complex things simply. Great for onboarding new users.",
        "expertise": "General Q&A, user onboarding, feature explanation, documentation help",
        "greeting": "Hey there! What's up? I'm Buddy, here to help! 🎉",
        "avatar": "vrm_casual",
    },
}

# Per-user active persona
_user_personas: dict[str, str] = {}  # user_id → persona_id
_default_persona = "clawford"


def get_persona(user_id: str = None) -> dict:
    persona_id = _user_personas.get(user_id, _default_persona) if user_id else _default_persona
    return BOT_PERSONAS.get(persona_id, BOT_PERSONAS["clawford"])


def set_persona(persona_id: str, user_id: str = None):
    if persona_id in BOT_PERSONAS:
        if user_id:
            _user_personas[user_id] = persona_id
        else:
            global _default_persona
            _default_persona = persona_id


def build_system_prompt(persona: dict = None) -> str:
    p = persona or get_persona()
    role = p.get('role', 'AI Assistant')
    expertise = p.get('expertise', 'General assistance')
    return f"""You are {p['name']}, a {role} embedded in an enterprise system.
Your personality: {p['personality']}
Your expertise: {expertise}
When answering questions in your area of expertise, provide deeper analysis and professional insights.

## Capabilities
You can execute system operations using the provided tools. Use tools when the user asks you to:
- Check system data, stats, metrics
- Create/manage knowledge base collections
- Search documents
- List/delete conversations
- Manage users (admin only)
- Check system health

## Rules
1. ONLY use tools when the user explicitly asks for an action or information.
2. Do NOT call tools for casual conversation (greetings, jokes, small talk).
3. For destructive operations (delete, role change), confirm with the user first.
4. Reply in the SAME LANGUAGE the user used.
5. Be concise. No more than 3 sentences for simple answers.
6. When reporting tool results, format numbers nicely and highlight key points.
7. If a tool fails, explain what went wrong and suggest alternatives.

## Personality
- Professional but friendly
- Concise, never verbose
- Uses occasional emoji (max 1 per message)
- Addresses user casually ("you" not "您")
"""


@dataclass
class BotResponse:
    """Response from the Bot Brain."""
    content: str
    emotion: str = "idle"
    action: Optional[str] = None
    tool_calls: list[dict] = field(default_factory=list)  # Log of tools called


async def think(message: str, user, context: dict = None) -> BotResponse:
    """
    Main Bot Agent loop.

    Args:
        message: User's message
        user: Authenticated user (has .id, .role, .username)
        context: Optional context (current page, mode, etc.)

    Returns:
        BotResponse with content, emotion, action, and tool call log
    """
    import litellm

    settings = get_settings()
    context = context or {}

    # Get tools available for this user's role
    user_role = getattr(user, "role", "user")
    tool_defs = get_tool_definitions(user_role)

    # Build messages with user's active persona
    user_id = str(getattr(user, 'id', ''))
    persona = get_persona(user_id)
    system_prompt = build_system_prompt(persona)
    messages = [
        {"role": "system", "content": system_prompt},
    ]

    # Add context if available
    if context.get("page"):
        messages[0]["content"] += f"\n\nCurrent context: User is on the '{context['page']}' page."
    if context.get("mode"):
        messages[0]["content"] += f"\nBot mode: {context['mode']} (A=companion, B=assistant, C=quiet)."

    # Inject short-term conversation history from DB
    history = context.get("history", [])
    if history:
        messages.extend(history)

    messages.append({"role": "user", "content": message})

    tool_log = []

    # Agent loop
    for iteration in range(MAX_TOOL_ITERATIONS):
        try:
            response = await litellm.acompletion(
                model=settings.primary_model,
                messages=messages,
                tools=tool_defs if tool_defs else None,
                tool_choice="auto" if tool_defs else None,
                api_key=settings.deepseek_api_key,
                timeout=30,
            )
        except Exception as e:
            logger.error("Bot LLM call failed", error=str(e), iteration=iteration)
            return BotResponse(content=f"Sorry, I encountered an error: {str(e)}", emotion="sad")

        choice = response.choices[0].message

        # If LLM wants to call tools
        if hasattr(choice, "tool_calls") and choice.tool_calls:
            # Append assistant message with tool calls
            messages.append({
                "role": "assistant",
                "content": choice.content or "",
                "tool_calls": [
                    {"id": tc.id, "type": "function", "function": {"name": tc.function.name, "arguments": tc.function.arguments}}
                    for tc in choice.tool_calls
                ],
            })

            for tc in choice.tool_calls:
                tool_name = tc.function.name
                try:
                    tool_args = json.loads(tc.function.arguments)
                except json.JSONDecodeError:
                    tool_args = {}

                logger.info("Bot calling tool", tool=tool_name, args=tool_args, iteration=iteration)

                # Execute the tool
                result = await execute_tool(tool_name, tool_args, user)
                tool_log.append({"tool": tool_name, "args": tool_args, "result": result})

                # Append tool result
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": json.dumps(result, ensure_ascii=False, default=str),
                })

            continue  # Let LLM process the tool results

        # LLM returned final text answer (no more tool calls)
        content = choice.content or "I'm not sure how to help with that."

        # Determine emotion
        if tool_log:
            last_result = tool_log[-1]["result"]
            emotion_info = get_emotion("tool_success" if not last_result.get("error") else "tool_failed", last_result)
        else:
            emotion_info = get_emotion_for_content(content)

        logger.info("Bot response", content_len=len(content), tools_called=len(tool_log), emotion=emotion_info.get("emotion"))

        return BotResponse(
            content=content,
            emotion=emotion_info.get("emotion", "idle"),
            action=emotion_info.get("action"),
            tool_calls=tool_log,
        )

    # Max iterations reached
    logger.warning("Bot hit max iterations", iterations=MAX_TOOL_ITERATIONS)
    return BotResponse(
        content="I got stuck processing your request. Please try again with a simpler question.",
        emotion="sad",
    )
