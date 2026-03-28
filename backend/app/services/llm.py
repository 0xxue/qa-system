"""
LLM Service - Unified multi-model interface via LiteLLM

Replaces V2's separate ClaudeClient (200+ lines) and OpenAIClient (200+ lines)
with a single function that routes to any model via LiteLLM.

Features:
- One-line model switching
- Automatic fallback chain (Claude → GPT → DeepSeek)
- Token counting and budget control
- Retry with exponential backoff
"""

import json
import structlog
from typing import Optional
from tenacity import retry, stop_after_attempt, wait_exponential

import litellm
from app.core.config import get_settings

logger = structlog.get_logger()

# Configure LiteLLM
settings = get_settings()
litellm.set_verbose = False

# Budget control
litellm.max_budget = settings.max_budget_monthly


MODEL_MAP = {
    "primary": settings.primary_model,      # anthropic/claude-sonnet-4-20250514
    "secondary": settings.secondary_model,  # openai/gpt-4o
    "fallback": settings.fallback_model,    # deepseek/deepseek-chat
}


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=15))
async def call_llm(
    model: str = "primary",
    system: str = "",
    user: str = "",
    history: list[dict] = None,
    response_format: Optional[str] = None,
    json_schema: Optional[dict] = None,
    temperature: float = 0.3,
) -> any:
    """
    Call LLM with automatic fallback.

    Args:
        model: "primary" / "secondary" / "fallback" or direct model string
        system: System prompt
        user: User message
        history: Conversation history [{role, content}] inserted between system and user
        response_format: "json" for JSON response
        temperature: Creativity level (0-1)

    Returns:
        str or dict (if response_format="json")
    """
    model_id = MODEL_MAP.get(model, model)

    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    if history:
        messages.extend(history)
    messages.append({"role": "user", "content": user})

    try:
        response = await litellm.acompletion(
            model=model_id,
            messages=messages,
            temperature=temperature,
            fallbacks=[MODEL_MAP["secondary"], MODEL_MAP["fallback"]],
        )

        content = response.choices[0].message.content

        # Log token usage
        usage = response.usage
        logger.info(
            "LLM call",
            model=model_id,
            input_tokens=usage.prompt_tokens,
            output_tokens=usage.completion_tokens,
            total_tokens=usage.total_tokens,
        )

        # Parse JSON if requested
        if response_format == "json":
            try:
                # Strip markdown code blocks if present
                cleaned = content.strip()
                if cleaned.startswith("```"):
                    cleaned = cleaned.split("\n", 1)[1].rsplit("```", 1)[0]
                return json.loads(cleaned)
            except json.JSONDecodeError:
                logger.warning("Failed to parse JSON response, returning raw", content=content[:200])
                return {"answer": content, "confidence": 0.5}

        return content

    except Exception as e:
        logger.error("LLM call failed", model=model_id, error=str(e))
        raise
