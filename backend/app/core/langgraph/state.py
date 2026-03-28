"""
LangGraph State Definition

The state flows through all nodes in the graph.
Each node reads from and writes to this shared state.
"""

from typing import TypedDict, Optional, Any
from langgraph.graph import MessagesState


class QAState(TypedDict):
    """Shared state for the QA workflow graph."""

    # Input
    query: str                          # User's original question
    user_id: str                        # Authenticated user ID
    conversation_id: Optional[str]      # For multi-turn conversations
    conversation_history: list[dict]    # Recent messages for multi-turn context [{role, content}]
    conversation_summary: Optional[str] # Compressed summary of older messages

    # Intent detection
    intents: list[str]                  # Decomposed sub-questions (may be 1 or multiple)
    query_type: str                     # simple_data / comparison / prediction / aggregation / knowledge / mixed
    data_source: Optional[str]          # api / knowledge_base / both — determines which sources to search

    # RAG routing
    matched_apis: list[dict]            # APIs matched by RAG: [{name, endpoint, confidence}]
    rag_confidence: float               # Highest RAG match confidence (0-1)

    # Knowledge base
    kb_context: Optional[str]           # Relevant KB chunks concatenated as context

    # Data fetching
    api_results: dict[str, Any]         # Raw API responses: {api_name: response_data}
    data_quality: dict[str, float]      # Quality scores: {completeness, accuracy, freshness}

    # AI analysis
    answer: str                         # Final generated answer
    sources: list[str]                  # Data sources used
    confidence: float                   # Overall answer confidence (0-1)
    needs_review: bool                  # Whether human review is needed

    # Visualization
    chart: Optional[dict]               # Chart config: {type, data, options}

    # Metadata
    trace_id: str                       # Request trace ID
    processing_steps: list[str]         # Log of completed steps (for SSE progress)
    error: Optional[str]                # Error message if any step failed
