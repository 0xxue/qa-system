"""
QA Endpoints - Core AI question answering with conversation persistence

POST /qa/ask       → Single response (saves to DB)
POST /qa/stream    → SSE streaming response (saves to DB)
GET  /qa/conversations → List user's conversations
GET  /qa/conversations/:id → Get conversation with messages
DELETE /qa/conversations/:id → Delete conversation
"""

import json
import uuid
import structlog
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from app.schemas.qa import QARequest, QAResponse
from app.services.auth import get_optional_user
from app.services.database import get_session
from app.services.conversation import ConversationService
from app.core.langgraph.graph import qa_graph
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()
logger = structlog.get_logger()


async def _get_or_create_conversation(session: AsyncSession, user_id, conv_id=None):
    """Get existing or create new conversation."""
    svc = ConversationService(session)
    if conv_id:
        try:
            conv = await svc.get_conversation(int(conv_id), int(user_id))
            if conv:
                return int(conv_id), svc
        except (ValueError, TypeError):
            pass
    # Create new
    conv = await svc.create_conversation(int(user_id) if str(user_id).isdigit() else 1)
    return conv.id, svc


@router.post("/ask", response_model=QAResponse)
async def ask(request: QARequest, user=Depends(get_optional_user)):
    """Single-shot QA with conversation persistence."""
    logger.info("QA request", user_id=user.id, query=request.query[:100])

    thread_id = request.conversation_id or str(uuid.uuid4())
    config = {"configurable": {"thread_id": thread_id}}

    # Save conversation to DB if available
    conv_id = None
    from app.services.database import _session_factory
    if _session_factory:
        try:
            async with _session_factory() as session:
                conv_id, svc = await _get_or_create_conversation(session, user.id, request.conversation_id)
                await svc.add_message(conv_id, "user", request.query)
        except Exception as e:
            logger.warning("Failed to save user message", error=str(e))

    # Run LangGraph
    result = await qa_graph.ainvoke({
        "query": request.query,
        "user_id": str(user.id),
        "conversation_id": thread_id,
    }, config=config)

    answer = result.get("answer", "")
    sources = result.get("sources", [])
    confidence = result.get("confidence", 0.0)

    # Save AI response to DB
    if _session_factory and conv_id:
        try:
            async with _session_factory() as session:
                svc = ConversationService(session)
                await svc.add_message(
                    conv_id, "assistant", answer,
                    sources=sources,
                    chart=result.get("chart"),
                    confidence=confidence,
                )
                # Auto-generate title on first message
                await svc.auto_generate_title(conv_id, request.query)
        except Exception as e:
            logger.warning("Failed to save AI response", error=str(e))

    return QAResponse(
        answer=answer,
        sources=sources,
        chart=result.get("chart"),
        confidence=confidence,
        trace_id=result.get("trace_id", ""),
    )


@router.post("/stream")
async def stream(request: QARequest, user=Depends(get_optional_user)):
    """SSE streaming QA with conversation persistence."""
    logger.info("QA stream request", user_id=user.id, query=request.query[:100])

    thread_id = request.conversation_id or str(uuid.uuid4())
    config = {"configurable": {"thread_id": thread_id}}

    # Save user message
    conv_id = None
    from app.services.database import _session_factory
    if _session_factory:
        try:
            async with _session_factory() as session:
                conv_id, svc = await _get_or_create_conversation(session, user.id, request.conversation_id)
                await svc.add_message(conv_id, "user", request.query)
        except Exception as e:
            logger.warning("Failed to save user message", error=str(e))

    async def generate():
        full_answer = ""
        full_sources = []
        full_confidence = 0.0
        full_chart = None

        # Send conversation_id so frontend can track it
        if conv_id:
            yield f"data: {json.dumps({'conversation_id': conv_id})}\n\n"

        try:
            async for event in qa_graph.astream({
                "query": request.query,
                "user_id": str(user.id),
                "conversation_id": thread_id,
            }, config=config):
                node_name = list(event.keys())[0]
                node_output = event[node_name]

                yield f"data: {json.dumps({'step': node_name}, ensure_ascii=False)}\n\n"

                if "answer" in node_output:
                    full_answer = node_output["answer"]
                    yield f"data: {json.dumps({'answer': full_answer}, ensure_ascii=False)}\n\n"
                if "sources" in node_output:
                    full_sources = node_output["sources"]
                    yield f"data: {json.dumps({'sources': full_sources}, ensure_ascii=False)}\n\n"
                if "chart" in node_output and node_output["chart"]:
                    full_chart = node_output["chart"]
                    yield f"data: {json.dumps({'chart': full_chart}, ensure_ascii=False)}\n\n"
                if "confidence" in node_output:
                    full_confidence = node_output["confidence"]
                    yield f"data: {json.dumps({'confidence': full_confidence}, ensure_ascii=False)}\n\n"

            yield "data: [DONE]\n\n"

            # Save AI response to DB after stream completes
            if _session_factory and conv_id and full_answer:
                try:
                    async with _session_factory() as session:
                        svc = ConversationService(session)
                        await svc.add_message(
                            conv_id, "assistant", full_answer,
                            sources=full_sources, chart=full_chart, confidence=full_confidence,
                        )
                        await svc.auto_generate_title(conv_id, request.query)
                except Exception as e:
                    logger.warning("Failed to save AI response", error=str(e))

        except Exception as e:
            logger.error("Stream error", error=str(e))
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


def _get_sf():
    from app.services.database import _session_factory
    return _session_factory


@router.get("/conversations")
async def list_conversations(user=Depends(get_optional_user)):
    """List user's conversations."""
    sf = _get_sf()
    if not sf:
        return []
    try:
        async with sf() as session:
            svc = ConversationService(session)
            user_id = int(user.id) if str(user.id).isdigit() else 1
            return await svc.list_conversations(user_id)
    except Exception as e:
        logger.warning("Failed to list conversations", error=str(e))
        return []


@router.get("/conversations/{conv_id}")
async def get_conversation(conv_id: int, user=Depends(get_optional_user)):
    """Get conversation with all messages."""
    sf = _get_sf()
    if not sf:
        return {"error": "Database not available"}
    async with sf() as session:
        svc = ConversationService(session)
        user_id = int(user.id) if str(user.id).isdigit() else 1
        result = await svc.get_conversation(conv_id, user_id)
        if not result:
            return {"error": "Conversation not found"}
        return result


@router.delete("/conversations/{conv_id}")
async def delete_conversation(conv_id: int, user=Depends(get_optional_user)):
    """Delete a conversation."""
    sf = _get_sf()
    if not sf:
        return {"error": "Database not available"}
    async with sf() as session:
        svc = ConversationService(session)
        user_id = int(user.id) if str(user.id).isdigit() else 1
        ok = await svc.delete_conversation(conv_id, user_id)
        return {"deleted": ok}
