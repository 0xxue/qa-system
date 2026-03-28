"""
Rate Limiter Middleware

Token bucket algorithm with Redis backend for distributed rate limiting
across multiple API instances.

Supports:
    - Per-IP rate limiting (anonymous users)
    - Per-user rate limiting (authenticated users)
    - Per-endpoint rate limiting (expensive operations)
    - Burst allowance

Usage:
    app.add_middleware(RateLimiter, redis=redis_client, limit=60, window=60)

    # Or per-endpoint:
    @app.get("/api/v1/expensive")
    @rate_limit(limit=10, window=60)
    async def expensive_endpoint(): ...
"""

import time
import logging
from typing import Optional
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

logger = logging.getLogger("predict.rate_limiter")


class RateLimiter(BaseHTTPMiddleware):
    """
    Redis-backed distributed rate limiter using sliding window algorithm.

    Args:
        redis: Redis client instance
        limit: Maximum requests per window
        window: Time window in seconds
        burst: Extra burst allowance above limit
    """

    def __init__(self, app, redis=None, limit: int = 60, window: int = 60, burst: int = 10):
        super().__init__(app)
        self.redis = redis
        self.limit = limit
        self.window = window
        self.burst = burst
        # In-memory fallback when Redis unavailable
        self._local_store: dict[str, list[float]] = {}

    async def dispatch(self, request: Request, call_next):
        # Skip WebSocket connections (BaseHTTPMiddleware doesn't support WS)
        if "websocket" in request.scope.get("type", ""):
            return await call_next(request)
        # Skip upgrade requests (WebSocket handshake)
        if request.headers.get("upgrade", "").lower() == "websocket":
            return await call_next(request)
        # Skip rate limiting for health checks
        if request.url.path in ("/health", "/api/v1/health"):
            return await call_next(request)

        # Determine rate limit key (IP or user_id)
        client_ip = request.client.host if request.client else "unknown"
        user_id = getattr(request.state, "user_id", None)
        key = f"ratelimit:{user_id or client_ip}"

        # Check rate limit
        allowed, remaining, reset_time = await self._check_limit(key)

        if not allowed:
            logger.warning(
                f"Rate limit exceeded for {key} on {request.url.path}"
            )
            return JSONResponse(
                status_code=429,
                content={
                    "error": "Too Many Requests",
                    "message": f"Rate limit exceeded. Try again in {reset_time} seconds.",
                    "retry_after": reset_time,
                },
                headers={
                    "Retry-After": str(reset_time),
                    "X-RateLimit-Limit": str(self.limit),
                    "X-RateLimit-Remaining": "0",
                },
            )

        response = await call_next(request)

        # Add rate limit headers
        response.headers["X-RateLimit-Limit"] = str(self.limit)
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        response.headers["X-RateLimit-Reset"] = str(reset_time)

        return response

    async def _check_limit(self, key: str) -> tuple[bool, int, int]:
        """
        Check if request is within rate limit.
        Returns: (allowed, remaining, reset_time_seconds)
        """
        now = time.time()
        window_start = now - self.window

        if self.redis:
            try:
                return await self._check_redis(key, now, window_start)
            except Exception:
                # Redis down, fall back to local
                pass

        return self._check_local(key, now, window_start)

    async def _check_redis(self, key: str, now: float, window_start: float):
        """Redis-backed sliding window counter."""
        pipe = self.redis.pipeline()
        pipe.zremrangebyscore(key, 0, window_start)  # Remove old entries
        pipe.zadd(key, {str(now): now})                # Add current request
        pipe.zcard(key)                                 # Count requests in window
        pipe.expire(key, self.window)                   # Set TTL
        results = await pipe.execute()

        count = results[2]
        max_allowed = self.limit + self.burst
        remaining = max(0, max_allowed - count)
        reset_time = int(self.window - (now - window_start))

        return count <= max_allowed, remaining, reset_time

    def _check_local(self, key: str, now: float, window_start: float):
        """In-memory fallback (single instance only)."""
        if key not in self._local_store:
            self._local_store[key] = []

        # Clean old entries
        self._local_store[key] = [
            t for t in self._local_store[key] if t > window_start
        ]
        self._local_store[key].append(now)

        count = len(self._local_store[key])
        max_allowed = self.limit + self.burst
        remaining = max(0, max_allowed - count)
        reset_time = int(self.window)

        return count <= max_allowed, remaining, reset_time
