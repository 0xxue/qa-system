"""QA request/response schemas."""

from pydantic import BaseModel, Field
from typing import Optional


class QARequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=2000, description="User question")
    conversation_id: Optional[str | int] = Field(None, description="For multi-turn conversations")


class SourceItem(BaseModel):
    type: str = ""
    name: str = ""
    endpoint: Optional[str] = None
    query_time: Optional[str] = None


class QAResponse(BaseModel):
    answer: str
    sources: list[SourceItem] = []
    chart: Optional[dict] = None
    confidence: float = Field(0.0, ge=0, le=1)
    trace_id: str = ""
