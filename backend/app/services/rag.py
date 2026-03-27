"""
RAG Service - Semantic API routing via LightRAG

Replaces hardcoded regex patterns with semantic vector search over API descriptions.

How it works:
1. At startup: API descriptions are indexed into LightRAG (embedding → vector store)
2. At query time: User question → embedding → find most similar API descriptions
3. Returns matched APIs with confidence scores

To adapt to your domain:
- Update API_DESCRIPTIONS below to match your data sources
- The semantic search will automatically handle synonyms and variations
"""

import os
import structlog
from typing import Optional
from lightrag import LightRAG, QueryParam
from lightrag.llm.openai import openai_complete_if_cache, openai_embed
from lightrag.utils import EmbeddingFunc
from app.core.config import get_settings

logger = structlog.get_logger()

# ══════════════════════════════════════════════════
# API Knowledge Base
# Update these descriptions to match YOUR data sources.
# The semantic search will handle query variations automatically.
# ══════════════════════════════════════════════════

API_DESCRIPTIONS = [
    {
        "name": "system_overview",
        "endpoint": "/api/v1/data/system/overview",
        "description": (
            "Query system-wide operational overview. "
            "Includes total users, active users, new users, total items, system health. "
            "Use for: overall status, dashboard data, system health check, how is the system doing"
        ),
    },
    {
        "name": "items_expiring",
        "endpoint": "/api/v1/data/items/expiring",
        "description": (
            "Query items expiring on a specific date. "
            "Items can be products, licenses, subscriptions, contracts, etc. "
            "Returns item name, expiry date, amount, status. "
            "Use for: expiring items, ending soon, deadline, about to expire, overdue"
        ),
        "params": {"date": "dynamic"},
    },
    {
        "name": "item_stats",
        "endpoint": "/api/v1/data/items/stats",
        "description": (
            "Query item statistics with time range filter. "
            "Includes quantity trends, new items, expiring items, active items. "
            "Use for: item analysis, trends, comparison, weekly/monthly report"
        ),
        "params": {"start_date": "dynamic", "end_date": "dynamic"},
    },
    {
        "name": "summary_metrics",
        "endpoint": "/api/v1/data/metrics/summary",
        "description": (
            "Query summary metrics and KPIs. "
            "Includes revenue, costs, profit, budget remaining, daily spend, runway days. "
            "Use for: budget status, cost analysis, how long will budget last, financial overview"
        ),
        "params": {"period": "daily|weekly|monthly"},
    },
    {
        "name": "user_stats",
        "endpoint": "/api/v1/data/users/stats",
        "description": (
            "Query user statistics. "
            "Includes total users, active users, retention rate, growth trend. "
            "Use for: user analysis, growth data, retention, how many users"
        ),
    },
]

# LightRAG instance
_rag: Optional[LightRAG] = None


async def _llm_func(prompt, system_prompt=None, history_messages=[], keyword_extraction=False, **kwargs):
    """LLM function for LightRAG, using DeepSeek via OpenAI-compatible API."""
    settings = get_settings()
    return await openai_complete_if_cache(
        model="deepseek-chat",
        prompt=prompt,
        system_prompt=system_prompt,
        history_messages=history_messages,
        api_key=settings.deepseek_api_key,
        base_url="https://api.deepseek.com/v1",
        **kwargs,
    )


async def _embed_func(texts: list[str], **kwargs):
    """
    Local embedding using sentence-transformers.
    No API key needed, runs on CPU.
    Uses paraphrase-multilingual-MiniLM-L12-v2 (supports Chinese + English).
    """
    import numpy as np
    from sentence_transformers import SentenceTransformer

    if not hasattr(_embed_func, "_model"):
        _embed_func._model = SentenceTransformer("paraphrase-multilingual-MiniLM-L12-v2")
        logger.info("Loaded local embedding model: paraphrase-multilingual-MiniLM-L12-v2")

    embeddings = _embed_func._model.encode(texts, normalize_embeddings=True)
    return np.array(embeddings)


async def init_rag():
    """Initialize RAG knowledge base at startup. Index all API descriptions."""
    global _rag
    settings = get_settings()

    working_dir = settings.rag_working_dir
    os.makedirs(working_dir, exist_ok=True)

    try:
        _rag = LightRAG(
            working_dir=working_dir,
            llm_model_func=_llm_func,
            embedding_func=EmbeddingFunc(
                embedding_dim=384,
                max_token_size=512,
                func=_embed_func,
            ),
        )

        documents = []
        for api in API_DESCRIPTIONS:
            doc = (
                f"API Name: {api['name']}\n"
                f"Endpoint: {api['endpoint']}\n"
                f"Description: {api['description']}\n"
            )
            if "params" in api:
                doc += f"Parameters: {api['params']}\n"
            documents.append(doc)

        await _rag.initialize_storages()

        combined = "\n---\n".join(documents)
        await _rag.ainsert(combined)

        logger.info("LightRAG initialized", api_count=len(documents), working_dir=working_dir)

    except Exception as e:
        logger.error("LightRAG init failed, falling back to keyword matching", error=str(e))
        _rag = None


async def search_apis(query: str, top_k: int = 3) -> list[dict]:
    """
    Search for matching APIs using semantic similarity.

    Returns:
        List of matched APIs: [{"name": "...", "endpoint": "...", "confidence": 0.85, "params": {...}}]
    """
    if _rag:
        return await _search_with_rag(query, top_k)
    else:
        logger.warning("LightRAG not available, using keyword fallback")
        return _search_with_keywords(query, top_k)


async def _search_with_rag(query: str, top_k: int) -> list[dict]:
    """Semantic search using LightRAG hybrid mode."""
    try:
        result = await _rag.aquery(
            query,
            param=QueryParam(mode="hybrid", top_k=top_k),
        )

        result_text = str(result).lower()

        matched = []
        for api in API_DESCRIPTIONS:
            name_lower = api["name"].lower()
            desc_keywords = api["description"][:30].lower()

            if name_lower in result_text or desc_keywords in result_text:
                matched.append({
                    "name": api["name"],
                    "endpoint": api["endpoint"],
                    "confidence": 0.85,
                    "params": api.get("params", {}),
                })

        if not matched and result_text.strip():
            for api in API_DESCRIPTIONS:
                keywords = api["description"].replace(".", " ").replace(",", " ").split()
                score = sum(1 for kw in keywords if kw.lower() in result_text)
                if score >= 2:
                    matched.append({
                        "name": api["name"],
                        "endpoint": api["endpoint"],
                        "confidence": min(score * 0.15, 0.9),
                        "params": api.get("params", {}),
                    })

        if matched:
            matched.sort(key=lambda x: x["confidence"], reverse=True)
            logger.info("RAG matched", query=query[:50], apis=[m["name"] for m in matched[:top_k]])
            return matched[:top_k]

        logger.warning("RAG returned no matches", query=query[:50])
        return [{
            "name": "system_overview",
            "endpoint": "/api/v1/data/system/overview",
            "confidence": 0.3,
            "params": {},
        }]

    except Exception as e:
        logger.error("RAG search failed", error=str(e))
        return _search_with_keywords(query, top_k)


def _search_with_keywords(query: str, top_k: int) -> list[dict]:
    """Fallback keyword matching when LightRAG is not available."""
    keywords_map = {
        "system_overview": ["overview", "status", "health", "dashboard", "system", "overall"],
        "items_expiring": ["expir", "ending", "deadline", "overdue", "due", "expire"],
        "item_stats": ["stats", "trend", "analysis", "compare", "report", "items"],
        "summary_metrics": ["budget", "revenue", "cost", "spend", "profit", "money", "metric"],
        "user_stats": ["user", "active", "retention", "growth", "register"],
    }

    matched = []
    query_lower = query.lower()
    for api in API_DESCRIPTIONS:
        keywords = keywords_map.get(api["name"], [])
        score = sum(1 for kw in keywords if kw in query_lower)
        if score > 0:
            matched.append({
                "name": api["name"],
                "endpoint": api["endpoint"],
                "confidence": min(score * 0.3, 0.9),
                "params": api.get("params", {}),
            })

    matched.sort(key=lambda x: x["confidence"], reverse=True)
    return matched[:top_k] if matched else [{
        "name": "system_overview",
        "endpoint": "/api/v1/data/system/overview",
        "confidence": 0.2,
        "params": {},
    }]
