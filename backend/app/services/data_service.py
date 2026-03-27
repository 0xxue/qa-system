"""
Data Service — Pluggable data source layer

Wraps data access with:
- Redis multi-layer caching (L1: 30s hot, L2: 5min stale fallback)
- Circuit breaker per endpoint
- Retry with exponential backoff

In production, replace _fetch() with real HTTP calls to your internal APIs.
For demo/testing, returns realistic mock data.

To adapt to your domain:
1. Update the API methods to match your data sources
2. Replace mock data with real API calls
3. Update API_DESCRIPTIONS in rag.py to match
"""

import structlog
from typing import Optional
from datetime import datetime, timedelta
from app.services.cache import cache_get, cache_set
from app.middleware.circuit_breaker import circuit_registry
from app.middleware.retry import retry, RetryConfig

logger = structlog.get_logger()


class DataService:
    """
    Business data access layer.
    Each method maps to an internal API endpoint.
    Customize these methods for your specific domain.
    """

    async def call_api(self, endpoint: str, params: dict = None) -> dict:
        """Generic API caller with cache + circuit breaker."""
        cache_key = f"data:{endpoint}:{hash(str(params or {}))}"

        # L1 cache
        cached = await cache_get(cache_key)
        if cached:
            return cached

        # Call with circuit breaker
        breaker = circuit_registry.get(endpoint.split("/")[-1])
        try:
            result = await breaker.call(self._fetch, endpoint, params or {})
            await cache_set(cache_key, result, ttl=30)
            await cache_set(f"stale:{cache_key}", result, ttl=300)
            return result
        except Exception as e:
            stale = await cache_get(f"stale:{cache_key}")
            if stale:
                logger.warning("Using stale cache", endpoint=endpoint)
                return {**stale, "_stale": True}
            raise

    @retry(**RetryConfig.EXTERNAL_API)
    async def _fetch(self, endpoint: str, params: dict) -> dict:
        """
        Actual API call. Replace with real HTTP calls in production:
            async with httpx.AsyncClient() as client:
                response = await client.get(f"http://your-api{endpoint}", params=params)
                return response.json()
        """
        return self._mock_data(endpoint, params)

    # ========== Data Source Methods ==========
    # Customize these for your domain (e-commerce, healthcare, IoT, etc.)

    async def get_system_overview(self) -> dict:
        """System overview — total entities, active count, health status."""
        return await self.call_api("/data/system/overview")

    async def get_daily_data(self, date: str = None) -> dict:
        """Daily operational data."""
        return await self.call_api("/data/daily", {"date": date})

    async def get_items_expiring(self, date: str = None) -> dict:
        """Items expiring on a specific date (products, licenses, subscriptions, etc.)."""
        return await self.call_api("/data/items/expiring", {"date": date})

    async def get_items_interval(self, start_date: str = None, end_date: str = None) -> dict:
        """Items in a date range."""
        return await self.call_api("/data/items/interval", {"start_date": start_date, "end_date": end_date})

    async def get_user_stats(self) -> dict:
        """User statistics."""
        return await self.call_api("/data/users/stats")

    async def get_category_distribution(self) -> dict:
        """Category/tier distribution."""
        return await self.call_api("/data/categories/distribution")

    async def get_summary_metrics(self, period: str = "daily") -> dict:
        """Summary metrics — revenue, costs, key KPIs."""
        return await self.call_api("/data/metrics/summary", {"period": period})

    async def get_item_stats(self, start_date: str = None, end_date: str = None) -> dict:
        """Item statistics and trends."""
        return await self.call_api("/data/items/stats", {"start_date": start_date, "end_date": end_date})

    # ========== Mock Data (for demo/testing) ==========

    def _mock_data(self, endpoint: str, params: dict) -> dict:
        """Realistic mock data. Replace with real API calls in production."""
        today = datetime.now().strftime("%Y-%m-%d")

        mocks = {
            "/data/system/overview": {
                "total_users": 12580,
                "active_users": 3456,
                "new_users_today": 89,
                "total_items": 580,
                "system_health": "healthy",
                "query_time": today,
            },
            "/data/daily": {
                "date": params.get("date", today),
                "new_users": 89,
                "active_users": 3456,
                "transactions": 1234,
                "revenue": 456000.00,
                "costs": 312000.00,
            },
            "/data/items/expiring": {
                "date": params.get("date", today),
                "total": 23,
                "items": [
                    {"name": f"Item-{i}", "amount": 50000 + i * 10000, "expire_date": today}
                    for i in range(5)
                ],
                "total_amount": 850000.00,
            },
            "/data/items/interval": {
                "start_date": params.get("start_date", today),
                "end_date": params.get("end_date", today),
                "total": 45,
                "daily_breakdown": [
                    {"date": (datetime.now() - timedelta(days=i)).strftime("%Y-%m-%d"), "count": 5 + i, "amount": 100000 + i * 20000}
                    for i in range(7)
                ],
            },
            "/data/users/stats": {
                "total": 12580,
                "active": 3456,
                "new_today": 89,
                "retention_7d": 72.5,
                "retention_30d": 45.8,
                "growth_rate": 5.2,
            },
            "/data/categories/distribution": {
                "categories": [
                    {"name": "Tier 1", "count": 5000, "percentage": 39.7},
                    {"name": "Tier 2", "count": 3500, "percentage": 27.8},
                    {"name": "Tier 3", "count": 2500, "percentage": 19.9},
                    {"name": "Tier 4", "count": 1000, "percentage": 7.9},
                    {"name": "Tier 5", "count": 580, "percentage": 4.6},
                ],
            },
            "/data/metrics/summary": {
                "period": params.get("period", "daily"),
                "revenue": 456000.00,
                "costs": 312000.00,
                "profit": 144000.00,
                "budget_remaining": 8500000.00,
                "daily_spend": 125000.00,
                "days_remaining": 68,
                "status": "healthy",
            },
            "/data/items/stats": {
                "total_items": 580,
                "active_items": 456,
                "new_this_week": 23,
                "expiring_this_week": 15,
                "trend": [
                    {"date": (datetime.now() - timedelta(days=i)).strftime("%Y-%m-%d"), "active": 450 + i * 2, "new": 3 + i}
                    for i in range(7)
                ],
            },
        }

        normalized = endpoint.replace("/api/v1", "")
        return mocks.get(normalized, {"error": f"Unknown endpoint: {endpoint}"})
