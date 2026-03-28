"""
API V1 Router - aggregates all endpoint modules.
"""

from fastapi import APIRouter

from app.api.v1.health import router as health_router
from app.api.v1.auth import router as auth_router
from app.api.v1.qa import router as qa_router
from app.api.v1.data import router as data_router
from app.api.v1.kb import router as kb_router
from app.api.v1.admin import router as admin_router
from app.api.v1.ws import router as ws_router

api_router = APIRouter()

api_router.include_router(health_router, tags=["Health"])
api_router.include_router(auth_router, prefix="/auth", tags=["Authentication"])
api_router.include_router(qa_router, prefix="/qa", tags=["QA"])
api_router.include_router(data_router, prefix="/data", tags=["Data"])
api_router.include_router(kb_router, prefix="/kb", tags=["Knowledge Base"])
api_router.include_router(admin_router, prefix="/admin", tags=["Admin"])
api_router.include_router(ws_router, tags=["Bot WebSocket"])
