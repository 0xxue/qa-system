"""
Data Endpoints - Business data queries

These endpoints are called by the LangGraph workflow (via RAG routing),
and can also be called directly by the frontend.

Customize these for your domain.
"""

from fastapi import APIRouter, Depends, Query
from app.services.auth import get_current_user
from app.services.data_service import DataService

router = APIRouter()


@router.get("/system/overview")
async def system_overview(user=Depends(get_current_user)):
    """System-wide overview: total users, active users, items, health."""
    svc = DataService()
    return await svc.get_system_overview()


@router.get("/items/expiring")
async def items_expiring(
    date: str = Query(None, description="Date string, e.g. 'today', 'tomorrow', '2025-12-01'"),
    user=Depends(get_current_user),
):
    """Items expiring on or near the specified date."""
    svc = DataService()
    return await svc.get_items_expiring(date)


@router.get("/items/stats")
async def item_stats(
    start_date: str = Query(None),
    end_date: str = Query(None),
    user=Depends(get_current_user),
):
    """Item statistics for a date range."""
    svc = DataService()
    return await svc.get_item_stats(start_date, end_date)


@router.get("/metrics/summary")
async def summary_metrics(
    period: str = Query("daily", description="daily / weekly / monthly"),
    user=Depends(get_current_user),
):
    """Summary metrics: revenue, costs, KPIs."""
    svc = DataService()
    return await svc.get_summary_metrics(period)


@router.get("/users/stats")
async def user_stats(user=Depends(get_current_user)):
    """User statistics: registrations, active, retention."""
    svc = DataService()
    return await svc.get_user_stats()


@router.get("/categories/distribution")
async def category_distribution(user=Depends(get_current_user)):
    """Category/tier distribution."""
    svc = DataService()
    return await svc.get_category_distribution()
