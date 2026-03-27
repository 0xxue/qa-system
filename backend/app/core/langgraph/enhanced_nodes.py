"""
Enhanced LangGraph Nodes — Agentic RAG 2026 Standard

Three additional nodes that bring the architecture to production-grade:
1. Query Rewriter — Rewrites unclear queries for better RAG retrieval
2. Hallucination Checker — Validates AI answers against source data
3. Reranker — Re-scores RAG results for higher precision
"""

import structlog
from app.services.llm import call_llm
from app.core.langgraph.state import QAState

logger = structlog.get_logger()


# ========== Node: Query Rewriter ==========

async def rewrite_query(state: QAState) -> dict:
    """
    Rewrites the user's query for better RAG retrieval.

    When the original query is vague, ambiguous, or uses slang,
    this node generates a clearer version optimized for semantic search.

    Example:
        "数据咋样" → "系统整体运营数据概览，包括用户数、资金余额、活跃度"
        "钱还够吗" → "当前资金余额和日均消耗，资金可用天数预测"
    """
    query = state["query"]
    rag_confidence = state.get("rag_confidence", 0)

    # Only rewrite if RAG confidence is low (query might be unclear)
    if rag_confidence >= 0.7:
        return {"processing_steps": state.get("processing_steps", []) + ["rewrite_skipped"]}

    rewritten = await call_llm(
        model="primary",
        system="""你是查询优化专家。用户的问题可能模糊或口语化，请改写为更清晰、更适合语义搜索的版本。

规则：
1. 保持原意，不要添加用户没问的内容
2. 展开缩写和口语（"咋样"→"怎么样"，"够不够"→"是否充足"）
3. 补充隐含的具体指标
4. 如果原始查询已经清晰，原样返回

只返回改写后的查询文本，不要解释。""",
        user=f"原始查询：{query}",
    )

    rewritten = rewritten.strip().strip('"').strip("'")

    if rewritten and rewritten != query:
        logger.info("Query rewritten", original=query[:50], rewritten=rewritten[:50])
        return {
            "query": rewritten,
            "processing_steps": state.get("processing_steps", []) + ["query_rewritten"],
        }

    return {"processing_steps": state.get("processing_steps", []) + ["rewrite_unchanged"]}


# ========== Node: Hallucination Checker ==========

async def check_hallucination(state: QAState) -> dict:
    """
    Validates the AI's answer against the actual source data.

    Catches fabricated numbers, invented trends, or claims not supported
    by the retrieved data. If hallucination is detected, the answer is
    flagged and corrected.

    This is critical for data-driven answers where wrong numbers
    can lead to bad decisions.
    """
    answer = state.get("answer", "")
    api_results = state.get("api_results", {})
    confidence = state.get("confidence", 0)

    # Skip for fallback answers (no data to check against)
    if not api_results or confidence < 0.3:
        return {"processing_steps": state.get("processing_steps", []) + ["hallucination_check_skipped"]}

    # Format source data for comparison
    import json
    source_data = json.dumps(api_results, ensure_ascii=False, default=str)[:3000]

    check_result = await call_llm(
        model="secondary",
        system="""你是事实核查专家。对比 AI 的回答和原始数据，检查是否有幻觉（编造的数据/不存在的趋势/错误的计算）。

返回 JSON：
{
    "has_hallucination": true/false,
    "issues": ["问题1", "问题2"],
    "corrected_answer": "修正后的回答（如果有问题）或 null"
}

规则：
1. 只检查数字和事实是否与原始数据一致
2. AI 的分析和建议不算幻觉（那是推理）
3. 如果数据不足导致 AI 做了合理推测，不算幻觉但要标注""",
        user=f"AI回答：\n{answer[:2000]}\n\n原始数据：\n{source_data}",
        response_format="json",
    )

    has_hallucination = check_result.get("has_hallucination", False)
    issues = check_result.get("issues", [])

    if has_hallucination and issues:
        corrected = check_result.get("corrected_answer")
        if corrected:
            logger.warning("Hallucination detected and corrected", issues=issues)
            return {
                "answer": corrected,
                "confidence": max(confidence - 0.2, 0.1),
                "processing_steps": state.get("processing_steps", []) + ["hallucination_corrected"],
            }
        else:
            # Add warning to answer
            warning = "\n\n⚠️ **数据核查提示：** " + "；".join(issues)
            logger.warning("Hallucination detected", issues=issues)
            return {
                "answer": answer + warning,
                "confidence": max(confidence - 0.15, 0.1),
                "processing_steps": state.get("processing_steps", []) + ["hallucination_flagged"],
            }

    logger.info("Hallucination check passed")
    return {"processing_steps": state.get("processing_steps", []) + ["hallucination_check_passed"]}


# ========== Node: Reranker ==========

async def rerank_results(state: QAState) -> dict:
    """
    Re-scores and reorders RAG search results for higher precision.

    LightRAG returns results by vector similarity, but semantic similarity
    doesn't always mean relevance. The reranker uses an LLM to evaluate
    each result's actual relevance to the query.

    This reduces noise and ensures the AI analyzes the most relevant data.
    """
    matched_apis = state.get("matched_apis", [])
    query = state["query"]

    # Skip if too few results
    if len(matched_apis) <= 1:
        return {"processing_steps": state.get("processing_steps", []) + ["rerank_skipped"]}

    # Build candidates for reranking
    candidates = "\n".join([
        f"{i+1}. [{api['name']}] confidence={api.get('confidence', 0):.2f} — {api['endpoint']}"
        for i, api in enumerate(matched_apis)
    ])

    rerank_result = await call_llm(
        model="secondary",
        system="""你是相关性评估专家。根据用户的查询，对以下 API 候选结果按相关性重新排序。

返回 JSON：
{
    "ranked_indices": [2, 1, 3],
    "removed_indices": [4],
    "reason": "简短说明"
}

规则：
1. ranked_indices 按相关性从高到低排列（使用原始编号）
2. 完全不相关的放 removed_indices
3. 如果都相关，保持原顺序""",
        user=f"查询：{query}\n\n候选：\n{candidates}",
        response_format="json",
    )

    ranked_indices = rerank_result.get("ranked_indices", [])
    removed_indices = set(rerank_result.get("removed_indices", []))

    if ranked_indices:
        # Reorder based on LLM ranking
        reranked = []
        for idx in ranked_indices:
            actual_idx = idx - 1  # LLM uses 1-based
            if 0 <= actual_idx < len(matched_apis) and idx not in removed_indices:
                api = matched_apis[actual_idx].copy()
                # Boost confidence for top-ranked
                boost = 0.1 * (len(ranked_indices) - len(reranked)) / len(ranked_indices)
                api["confidence"] = min(api.get("confidence", 0.5) + boost, 1.0)
                reranked.append(api)

        if reranked:
            logger.info("Reranked results",
                       before=[a["name"] for a in matched_apis],
                       after=[a["name"] for a in reranked],
                       removed=list(removed_indices))
            return {
                "matched_apis": reranked,
                "processing_steps": state.get("processing_steps", []) + ["reranked"],
            }

    return {"processing_steps": state.get("processing_steps", []) + ["rerank_unchanged"]}
