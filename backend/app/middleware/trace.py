"""
Distributed Tracing Middleware

Generates a unique traceId for each request and propagates it across
microservices via X-Trace-Id header. Enables end-to-end request tracking
in distributed logging systems (ELK / Loki).

Usage:
    app.add_middleware(TraceMiddleware)

    # In any route, access trace_id:
    trace_id = request.state.trace_id
"""

import uuid
import time
import logging
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

logger = logging.getLogger("predict.trace")


class TraceMiddleware(BaseHTTPMiddleware):
    """
    Adds distributed tracing to every request:
    - Generates or propagates X-Trace-Id header
    - Logs request start/end with duration
    - Attaches trace_id to request.state for downstream use
    """

    async def dispatch(self, request: Request, call_next):
        # Skip WebSocket connections
        if request.headers.get("upgrade", "").lower() == "websocket":
            return await call_next(request)
        # Propagate existing trace_id or generate new one
        trace_id = request.headers.get("X-Trace-Id", str(uuid.uuid4())[:16])
        request.state.trace_id = trace_id

        start_time = time.time()

        # Log request start
        logger.info(
            f"[{trace_id}] {request.method} {request.url.path} - started",
            extra={"trace_id": trace_id, "method": request.method, "path": request.url.path}
        )

        try:
            response = await call_next(request)
            duration = round((time.time() - start_time) * 1000, 2)

            # Log request completion
            logger.info(
                f"[{trace_id}] {request.method} {request.url.path} "
                f"- {response.status_code} ({duration}ms)",
                extra={
                    "trace_id": trace_id,
                    "status_code": response.status_code,
                    "duration_ms": duration,
                }
            )

            # Slow request warning (>3s)
            if duration > 3000:
                logger.warning(
                    f"[{trace_id}] SLOW REQUEST: {request.url.path} took {duration}ms",
                    extra={"trace_id": trace_id, "duration_ms": duration}
                )

            # Attach trace_id to response header
            response.headers["X-Trace-Id"] = trace_id
            response.headers["X-Response-Time"] = f"{duration}ms"
            return response

        except Exception as e:
            duration = round((time.time() - start_time) * 1000, 2)
            logger.error(
                f"[{trace_id}] {request.method} {request.url.path} "
                f"- ERROR ({duration}ms): {str(e)}",
                extra={"trace_id": trace_id, "error": str(e)},
                exc_info=True
            )
            raise
