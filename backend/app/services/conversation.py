"""
Conversation Service — Multi-turn dialogue management

Features:
- CRUD operations for conversations and messages
- Auto-generate conversation title from first message (via AI)
- Context window: send last N messages as context for multi-turn
- Persist all messages with sources, charts, token usage
"""

import structlog
from typing import Optional
from sqlalchemy import select, desc, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.conversation import Conversation, Message
from app.services.llm import call_llm

logger = structlog.get_logger()

# How many recent messages to include as context for multi-turn
CONTEXT_WINDOW = 10
# Generate/update summary every N new messages
COMPRESS_THRESHOLD = 8


class ConversationService:
    """Manage conversations and messages."""

    def __init__(self, session: AsyncSession):
        self.session = session

    # ========== Conversations ==========

    async def list_conversations(self, user_id: int, limit: int = 20) -> list[dict]:
        """Get user's recent conversations."""
        stmt = (
            select(Conversation)
            .where(Conversation.user_id == user_id)
            .order_by(desc(Conversation.updated_at))
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        convs = result.scalars().all()
        return [
            {
                "id": c.id,
                "title": c.title,
                "message_count": c.message_count,
                "summary": c.summary,
                "created_at": c.created_at.isoformat() if c.created_at else None,
                "updated_at": c.updated_at.isoformat() if c.updated_at else None,
            }
            for c in convs
        ]

    async def create_conversation(self, user_id: int, title: str = "New Conversation") -> Conversation:
        """Create a new conversation."""
        conv = Conversation(user_id=user_id, title=title)
        self.session.add(conv)
        await self.session.commit()
        await self.session.refresh(conv)
        logger.info("Conversation created", conv_id=conv.id, user_id=user_id)
        return conv

    async def get_conversation(self, conv_id: int, user_id: int) -> Optional[dict]:
        """Get conversation with all messages."""
        stmt = select(Conversation).where(
            Conversation.id == conv_id,
            Conversation.user_id == user_id,
        )
        result = await self.session.execute(stmt)
        conv = result.scalar_one_or_none()
        if not conv:
            return None

        messages = await self._get_messages(conv_id)
        return {
            "id": conv.id,
            "title": conv.title,
            "message_count": conv.message_count,
            "messages": messages,
        }

    async def delete_conversation(self, conv_id: int, user_id: int) -> bool:
        """Delete conversation and all messages."""
        stmt = select(Conversation).where(
            Conversation.id == conv_id,
            Conversation.user_id == user_id,
        )
        result = await self.session.execute(stmt)
        conv = result.scalar_one_or_none()
        if not conv:
            return False
        await self.session.delete(conv)
        await self.session.commit()
        logger.info("Conversation deleted", conv_id=conv_id)
        return True

    # ========== Messages ==========

    async def add_message(
        self,
        conv_id: int,
        role: str,
        content: str,
        sources: list = None,
        chart: dict = None,
        model_used: str = None,
        tokens_in: int = 0,
        tokens_out: int = 0,
        confidence: float = None,
    ) -> Message:
        """Add a message to a conversation."""
        msg = Message(
            conversation_id=conv_id,
            role=role,
            content=content,
            sources_json=sources,
            chart_json=chart,
            model_used=model_used,
            tokens_in=tokens_in,
            tokens_out=tokens_out,
            confidence=confidence,
        )
        self.session.add(msg)

        # Update conversation message count
        stmt = select(Conversation).where(Conversation.id == conv_id)
        result = await self.session.execute(stmt)
        conv = result.scalar_one_or_none()
        if conv:
            conv.message_count = (conv.message_count or 0) + 1

        await self.session.commit()
        await self.session.refresh(msg)
        return msg

    async def get_context_messages(self, conv_id: int) -> list[dict]:
        """
        Get recent messages for multi-turn context.
        Returns last N messages formatted for LLM.
        """
        messages = await self._get_messages(conv_id, limit=CONTEXT_WINDOW)
        return [
            {"role": m["role"], "content": m["content"]}
            for m in messages
        ]

    async def _get_messages(self, conv_id: int, limit: int = 100) -> list[dict]:
        """Get messages for a conversation."""
        stmt = (
            select(Message)
            .where(Message.conversation_id == conv_id)
            .order_by(Message.created_at)
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        msgs = result.scalars().all()
        return [
            {
                "id": m.id,
                "role": m.role,
                "content": m.content,
                "sources": m.sources_json,
                "chart": m.chart_json,
                "model_used": m.model_used,
                "confidence": m.confidence,
                "created_at": m.created_at.isoformat() if m.created_at else None,
            }
            for m in msgs
        ]

    # ========== Summary & Compression ==========

    async def get_summary(self, conv_id: int) -> str:
        """Get the existing conversation summary (if any)."""
        stmt = select(Conversation).where(Conversation.id == conv_id)
        result = await self.session.execute(stmt)
        conv = result.scalar_one_or_none()
        return conv.summary or "" if conv else ""

    async def maybe_compress(self, conv_id: int):
        """
        Auto-compress conversation when message count exceeds threshold.
        Strategy: summarize messages older than the recent window,
        store as conversation.summary for injection into future prompts.
        Threshold: generate/update summary every COMPRESS_THRESHOLD messages.
        """
        stmt = select(Conversation).where(Conversation.id == conv_id)
        result = await self.session.execute(stmt)
        conv = result.scalar_one_or_none()
        if not conv:
            return

        msg_count = conv.message_count or 0
        summary_up_to = conv.summary_up_to or 0

        # Only compress if we have enough NEW messages since last summary
        if msg_count - summary_up_to < COMPRESS_THRESHOLD:
            return

        logger.info("Compressing conversation", conv_id=conv_id, msg_count=msg_count, summary_up_to=summary_up_to)
        await self._generate_summary(conv)

    async def _generate_summary(self, conv: "Conversation"):
        """
        Generate a summary of the conversation.
        Includes existing summary + messages since last summary.
        Keeps the summary concise for token efficiency.
        """
        conv_id = conv.id
        all_msgs = await self._get_messages(conv_id, limit=200)
        if not all_msgs:
            return

        # Build content to summarize: existing summary + all messages beyond the context window
        # We keep the last CONTEXT_WINDOW messages as-is (they'll be injected as history)
        msgs_to_summarize = all_msgs[:-CONTEXT_WINDOW] if len(all_msgs) > CONTEXT_WINDOW else []
        if not msgs_to_summarize and not conv.summary:
            return

        summary_input_parts = []
        if conv.summary:
            summary_input_parts.append(f"[Previous summary]: {conv.summary}")
        for m in msgs_to_summarize:
            role = m["role"]
            content = m["content"][:300]  # Truncate long messages
            summary_input_parts.append(f"{role}: {content}")

        summary_input = "\n".join(summary_input_parts)

        try:
            new_summary = await call_llm(
                model="secondary",
                system=(
                    "Summarize this conversation concisely in 2-5 sentences. "
                    "Preserve: key topics discussed, important conclusions, data points mentioned, "
                    "and any unresolved questions. Use the same language as the conversation. "
                    "Reply with ONLY the summary text."
                ),
                user=summary_input,
                temperature=0.2,
            )
            new_summary = new_summary.strip()[:1000]

            conv.summary = new_summary
            conv.summary_up_to = conv.message_count or 0
            await self.session.commit()
            logger.info("Summary generated", conv_id=conv_id, length=len(new_summary))
        except Exception as e:
            logger.warning("Summary generation failed", conv_id=conv_id, error=str(e))

    async def generate_summary_for_display(self, conv_id: int, user_id: int) -> str:
        """
        Generate/return a user-facing summary for display (e.g., bot narration).
        Returns cached summary if fresh enough, otherwise generates new one.
        """
        stmt = select(Conversation).where(
            Conversation.id == conv_id,
            Conversation.user_id == user_id,
        )
        result = await self.session.execute(stmt)
        conv = result.scalar_one_or_none()
        if not conv:
            return ""

        # If we have a fresh summary, use it
        if conv.summary and (conv.message_count or 0) - (conv.summary_up_to or 0) < COMPRESS_THRESHOLD:
            return conv.summary

        # Generate a quick summary from messages
        msgs = await self._get_messages(conv_id, limit=20)
        if not msgs:
            return ""

        msg_text = "\n".join(f"{m['role']}: {m['content'][:200]}" for m in msgs)
        try:
            summary = await call_llm(
                model="secondary",
                system=(
                    "Summarize this conversation in 1-3 short sentences for a quick preview. "
                    "Focus on the main topic and conclusion. Use the same language as the conversation. "
                    "Reply with ONLY the summary."
                ),
                user=msg_text,
                temperature=0.2,
            )
            summary = summary.strip()[:500]

            # Cache it
            conv.summary = summary
            conv.summary_up_to = conv.message_count or 0
            await self.session.commit()
            return summary
        except Exception as e:
            logger.warning("Display summary failed", error=str(e))
            # Fallback: return first assistant message
            for m in msgs:
                if m["role"] == "assistant" and m["content"]:
                    return m["content"][:150] + "..."
            return ""

    # ========== Auto Title ==========

    async def auto_generate_title(self, conv_id: int, first_message: str):
        """
        Generate conversation title from the first message using AI.
        Called after the first user message in a new conversation.
        """
        try:
            title = await call_llm(
                model="secondary",
                system="Generate a short conversation title (under 8 words) from the user's first message. Reply with ONLY the title text, no quotes. Use the same language as the user.",
                user=first_message,
            )
            title = title.strip().strip('"').strip("'")[:50]

            stmt = select(Conversation).where(Conversation.id == conv_id)
            result = await self.session.execute(stmt)
            conv = result.scalar_one_or_none()
            if conv:
                conv.title = title
                await self.session.commit()
                logger.info("Auto title generated", conv_id=conv_id, title=title)

        except Exception as e:
            logger.warning("Auto title generation failed", error=str(e))


# ========== Standalone helper (no DB session needed) ==========

async def get_conversation_history(user_id: str, conversation_id: str = None) -> list:
    """
    Lightweight helper for use without DB session.
    For full features, use ConversationService with a session.
    """
    # In-memory fallback when DB is not available
    return []
