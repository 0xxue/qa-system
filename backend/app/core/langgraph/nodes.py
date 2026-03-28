"""
LangGraph Node Implementations

8 nodes in the workflow graph. Each reads from state, does work, returns updates.
Integrates: LiteLLM, LightRAG, Calculator, ChartService, DataFormatter.
"""

import asyncio
import json
import structlog
from pathlib import Path
from datetime import datetime

from app.core.langgraph.state import QAState
from app.services.llm import call_llm
from app.services.rag import search_apis
from app.services.data_service import DataService
from app.services.chart_service import recommend_and_generate_chart
from app.utils.calculator import Calculator
from app.utils.formatter import DataFormatter
from app.utils.time_series import TimeSeriesBuilder

logger = structlog.get_logger()
calculator = Calculator()
formatter = DataFormatter()

PROMPTS_DIR = Path(__file__).parent.parent / "prompts"


def _load_prompt(name: str) -> str:
    """Load prompt template from file."""
    path = PROMPTS_DIR / f"{name}.md"
    try:
        return path.read_text(encoding="utf-8")
    except FileNotFoundError:
        logger.warning("Prompt template not found", name=name)
        return ""


# ========== Node 1: Intent Detection ==========

async def detect_intent(state: QAState) -> dict:
    """
    Decompose user query into sub-questions and classify type.
    Uses AI — replaces regex-based detection.
    Includes conversation history for multi-turn context.
    """
    query = state["query"]
    prompt = _load_prompt("intent").replace("{current_time}", datetime.now().strftime("%Y-%m-%d %H:%M"))

    # Build context-aware user message
    history = state.get("conversation_history", [])
    summary = state.get("conversation_summary", "")
    user_msg = query
    if summary or history:
        context_parts = []
        if summary:
            context_parts.append(f"[Conversation summary so far]: {summary}")
        if history:
            recent = "\n".join(f"{m['role']}: {m['content'][:200]}" for m in history[-6:])
            context_parts.append(f"[Recent messages]:\n{recent}")
        context_parts.append(f"[Current question]: {query}")
        user_msg = "\n\n".join(context_parts)

    response = await call_llm(
        model="primary",
        system=prompt,
        user=user_msg,
        response_format="json",
    )

    intents = response.get("intents", [query])
    query_type = response.get("query_type", "simple_data")
    data_source = response.get("data_source", "both")
    requires_calc = response.get("requires_calculation", False)

    logger.info("Intent detected", intents=intents, query_type=query_type, data_source=data_source, requires_calc=requires_calc)

    return {
        "intents": intents,
        "query_type": query_type,
        "data_source": data_source,
        "processing_steps": state.get("processing_steps", []) + ["intent_detected"],
    }


# ========== Node 2: Classify Data Source ==========

async def classify_source(state: QAState) -> dict:
    """
    Determine which data sources to query based on intent type.
    Routes to: API / knowledge base / database / mixed
    """
    query_type = state["query_type"]

    source_type = "api"
    if query_type == "knowledge":
        source_type = "knowledge_base"
    elif query_type == "report":
        source_type = "mixed"

    return {
        "processing_steps": state.get("processing_steps", []) + [f"source_classified:{source_type}"],
    }


# ========== Node 3: RAG Search ==========

async def rag_search(state: QAState) -> dict:
    """
    Semantic search with intent-based routing:
    - data_source='api' → only search API endpoints
    - data_source='knowledge_base' → only search KB documents
    - data_source='both' → search both (default)
    """
    intents = state["intents"]
    data_source = state.get("data_source", "both")
    all_matched = []
    max_confidence = 0.0
    kb_context = ""

    # Search API endpoints (skip if knowledge_base only)
    if data_source in ("api", "both"):
        for intent in intents:
            results = await search_apis(intent)
            for r in results:
                if r["name"] not in [m["name"] for m in all_matched]:
                    all_matched.append(r)
                max_confidence = max(max_confidence, r.get("confidence", 0))

    # Search knowledge base documents (skip if api only)
    if data_source in ("knowledge_base", "both"):
        try:
            from app.services.kb_service import KnowledgeBaseService
            kb_svc = KnowledgeBaseService()
            kb_results = await kb_svc.search(state["query"], top_k=5)
            if kb_results:
                kb_chunks = [
                    f"[KB: {r.get('metadata', {}).get('filename', 'document')}] {r['content']}"
                    for r in kb_results if r.get("similarity", 0) > 0.2
                ]
                if kb_chunks:
                    kb_context = "\n\n---\n\n".join(kb_chunks)
                    best_sim = max(r.get("similarity", 0) for r in kb_results)
                    if best_sim > 0.4:
                        max_confidence = max(max_confidence, best_sim)
                    logger.info("KB search results", chunks=len(kb_chunks), best_similarity=round(best_sim, 2))
        except Exception as e:
            logger.warning("KB search failed", error=str(e))

    # If knowledge_base only and no API matches needed, ensure confidence is high enough to proceed
    if data_source == "knowledge_base" and kb_context and not all_matched:
        max_confidence = max(max_confidence, 0.7)
        # Add a dummy API match so the graph doesn't fallback
        all_matched.append({"name": "system_overview", "endpoint": "/api/v1/data/system/overview", "confidence": 0.3, "params": {}})

    logger.info("RAG search complete", data_source=data_source, api_matches=len(all_matched), confidence=round(max_confidence, 2), has_kb=bool(kb_context))

    return {
        "matched_apis": all_matched,
        "rag_confidence": max_confidence,
        "kb_context": kb_context,
        "processing_steps": state.get("processing_steps", []) + ["rag_searched"],
    }


# ========== Node 4: Fetch Data (Parallel) ==========

async def fetch_data(state: QAState) -> dict:
    """Call all matched APIs in parallel. Protected by circuit breaker + cache."""
    matched_apis = state["matched_apis"]
    svc = DataService()

    tasks = []
    for api in matched_apis:
        tasks.append((api["name"], svc.call_api(api["endpoint"], api.get("params", {}))))

    names = [t[0] for t in tasks]
    calls = [t[1] for t in tasks]
    responses = await asyncio.gather(*calls, return_exceptions=True)

    results = {}
    for name, response in zip(names, responses):
        if isinstance(response, Exception):
            logger.warning("API failed", api=name, error=str(response))
            results[name] = {"error": str(response)}
        else:
            results[name] = response

    success = sum(1 for v in results.values() if "error" not in v)
    quality = {
        "completeness": success / len(results) if results else 0,
        "freshness": 1.0,
        "accuracy": 1.0 if success == len(results) else 0.8,
    }

    logger.info("Data fetched", total=len(results), success=success)

    return {
        "api_results": results,
        "data_quality": quality,
        "processing_steps": state.get("processing_steps", []) + ["data_fetched"],
    }


# ========== Node 5: Check Sufficiency (Agentic RAG) ==========

async def check_sufficiency(state: QAState) -> dict:
    """
    Check if fetched data is sufficient to answer the question.
    If not, trigger additional retrieval (Agentic RAG pattern).
    """
    quality = state.get("data_quality", {})
    completeness = quality.get("completeness", 0)

    if completeness >= 0.5:
        return {"processing_steps": state.get("processing_steps", []) + ["data_sufficient"]}

    logger.warning("Data insufficient", completeness=completeness)
    return {
        "processing_steps": state.get("processing_steps", []) + ["data_insufficient"],
        "error": "Some data sources failed. Analysis may be incomplete.",
    }


# ========== Node 6: AI Analysis (Dual Model) ==========

async def analyze(state: QAState) -> dict:
    """
    AI analyzes fetched data. Uses calculator for precise numbers.
    Low confidence → cross-validate with secondary model.
    """
    query = state["query"]
    api_results = state["api_results"]
    query_type = state["query_type"]

    calc_results = _run_calculations(api_results, query_type)

    # Build clearly separated data context
    data_sections = []

    # Section 1: API data
    api_context = _format_data_with_sources(api_results)
    if api_context.strip():
        data_sections.append(f"## [API] Real-time System Data\n\n{api_context}")

    if calc_results:
        data_sections.append(f"## [API] Calculation Results\n\n{json.dumps(calc_results, ensure_ascii=False, default=str)}")

    # Section 2: KB data
    kb_context = state.get("kb_context", "")
    if kb_context:
        data_sections.append(f"## [KB] Knowledge Base Documents\n\nThe following content was retrieved from uploaded documents in the knowledge base:\n\n{kb_context}")

    data_context = "\n\n---\n\n".join(data_sections)
    prompt = _load_prompt("analysis").replace("{data}", data_context)

    # Build multi-turn history for analysis context
    history = state.get("conversation_history", [])
    summary = state.get("conversation_summary", "")
    llm_history = []
    if summary:
        llm_history.append({"role": "user", "content": f"[Previous conversation summary]: {summary}"})
        llm_history.append({"role": "assistant", "content": "Understood, I'll consider the conversation context."})
    if history:
        llm_history.extend(history[-6:])  # Last 3 turns (6 messages)

    primary = await call_llm(model="primary", system=prompt, user=query, history=llm_history if llm_history else None, response_format="json")

    confidence = primary.get("confidence", 0.5)
    answer = primary.get("answer", str(primary))
    sources = primary.get("sources", [])

    if confidence < 0.7:
        logger.info("Cross-validating", confidence=confidence)
        secondary = await call_llm(
            model="secondary",
            system="Verify the following analysis. Correct if wrong, supplement if correct. Be concise.",
            user=f"Question: {query}\nAnalysis: {answer}\nData: {data_context[:1500]}",
        )
        answer += f"\n\n**Cross-validation:** {secondary}"
        confidence = min(confidence + 0.15, 1.0)

    needs_review = confidence < 0.5

    logger.info("Analysis complete", confidence=round(confidence, 2), needs_review=needs_review)

    return {
        "answer": answer,
        "sources": sources,
        "confidence": confidence,
        "needs_review": needs_review,
        "processing_steps": state.get("processing_steps", []) + ["analyzed"],
    }


# ========== Node 7: Generate Chart ==========

async def generate_chart(state: QAState) -> dict:
    """Generate ECharts config based on data and query type."""
    chart = await recommend_and_generate_chart(state["api_results"], state["query_type"])
    return {
        "chart": chart,
        "processing_steps": state.get("processing_steps", []) + ["chart_generated"],
    }


# ========== Node 8: Format Response + Source Attribution ==========

async def format_response(state: QAState) -> dict:
    """Final formatting: add source attribution, format numbers, add metadata."""
    sources = []
    for api in state.get("matched_apis", []):
        sources.append({
            "type": "api",
            "name": api["name"],
            "endpoint": api["endpoint"],
            "query_time": datetime.now().isoformat(),
        })

    if state.get("error"):
        answer = state.get("answer", "") + f"\n\n⚠️ {state['error']}"
    else:
        answer = state.get("answer", "")

    return {
        "answer": answer,
        "sources": sources,
        "processing_steps": state.get("processing_steps", []) + ["formatted"],
    }


# ========== Node: Fallback ==========

async def fallback(state: QAState) -> dict:
    """When RAG can't find matching APIs."""
    query = state["query"]
    logger.warning("Fallback triggered", query=query[:50])

    # Include history for multi-turn fallback
    history = state.get("conversation_history", [])
    llm_history = history[-6:] if history else None

    response = await call_llm(
        model="primary",
        system="The user's question couldn't be matched to a data source. Answer from general knowledge, but clearly state this is not based on real-time data. IMPORTANT: Reply in the same language the user used.",
        user=query,
        history=llm_history,
    )

    return {
        "answer": response,
        "confidence": 0.3,
        "sources": [{"type": "ai_knowledge", "name": "AI general knowledge"}],
        "needs_review": True,
        "processing_steps": state.get("processing_steps", []) + ["fallback"],
    }


# ========== Helper Functions ==========

def _run_calculations(api_results: dict, query_type: str) -> dict:
    """Run precise calculations on fetched data using Calculator."""
    calc = {}

    # Summary metrics calculations
    metrics = api_results.get("summary_metrics", {})
    if metrics and "error" not in metrics:
        if metrics.get("budget_remaining") and metrics.get("daily_spend"):
            calc["burn_rate"] = calculator.burn_rate(metrics["budget_remaining"], metrics["daily_spend"])
        if metrics.get("revenue") and metrics.get("costs"):
            calc["margin"] = calculator.margin(metrics["revenue"], metrics["costs"])

    # Item distribution analysis
    expiring = api_results.get("items_expiring", {})
    if expiring and "error" not in expiring and expiring.get("items"):
        calc["distribution"] = calculator.distribution_analysis(expiring["items"])

    # User engagement analysis
    users = api_results.get("user_stats", {})
    if users and "error" not in users:
        total = users.get("total", users.get("total_users", 0))
        active = users.get("active", users.get("active_users", 0))
        new = users.get("new_today", users.get("new_users_today", 0))
        if total > 0:
            calc["engagement"] = calculator.engagement_analysis(total, active, new)

    # Trend analysis from interval data
    interval = api_results.get("items_interval", api_results.get("item_stats", {}))
    if interval and "error" not in interval:
        breakdown = interval.get("daily_breakdown", interval.get("trend", []))
        if breakdown:
            values = [d.get("count", d.get("active", 0)) for d in breakdown]
            calc["trend"] = calculator.trend(values)
            calc["prediction"] = calculator.linear_prediction(values, future_steps=7)

            anomalies = TimeSeriesBuilder.detect_anomalies(values)
            if anomalies:
                calc["anomalies"] = anomalies

    return calc


def _format_data_with_sources(api_results: dict) -> str:
    """Format API results with source labels for AI context."""
    parts = []
    for name, data in api_results.items():
        if isinstance(data, dict) and "error" in data:
            parts.append(f"[{name}] ❌ Data fetch failed: {data['error']}")
        else:
            parts.append(f"[{name}] ✅\n{json.dumps(data, ensure_ascii=False, indent=2, default=str)}")
    return "\n\n".join(parts)
