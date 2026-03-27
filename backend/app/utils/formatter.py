"""
Data Formatter

Professional formatting for data display in reports and charts.
Supports: numbers, percentages, trends, currencies, time durations.

Industry-agnostic — currency formatting is optional, not default.

Examples:
    format_number(1500000)           → "1.5M" or "150万"
    format_percent(12.5, trend=True) → "↑12.50%"
    format_currency(1234.56, "USD")  → "$1,234.56"
"""

from decimal import Decimal
from typing import Optional


class DataFormatter:
    """Format data for display in reports and charts."""

    CURRENCIES = {
        "CNY": {"symbol": "¥", "name": "CNY", "decimals": 2},
        "USD": {"symbol": "$", "name": "USD", "decimals": 2},
        "EUR": {"symbol": "€", "name": "EUR", "decimals": 2},
    }

    TREND_ICONS = {
        "up": "↑",
        "down": "↓",
        "flat": "→",
    }

    @staticmethod
    def format_currency(value, currency: str = "USD", show_symbol: bool = True) -> str:
        """Format as currency: $1,234.56"""
        config = DataFormatter.CURRENCIES.get(currency, DataFormatter.CURRENCIES["USD"])
        d = config["decimals"]
        formatted = f"{float(value):,.{d}f}"
        if show_symbol:
            return f"{config['symbol']}{formatted}"
        return formatted

    @staticmethod
    def format_percent(value, decimals: int = 2, show_trend: bool = False) -> str:
        """Format as percentage: 12.50% or ↑12.50%"""
        formatted = f"{float(value):.{decimals}f}%"
        if show_trend:
            icon = "↑" if float(value) > 0 else "↓" if float(value) < 0 else "→"
            return f"{icon}{formatted}"
        return formatted

    @staticmethod
    def format_trend(value, as_percent: bool = True) -> str:
        """Format trend with icon: ↑12.5% or ↓3.2%"""
        v = float(value)
        icon = "↑" if v > 0 else "↓" if v < 0 else "→"
        if as_percent:
            return f"{icon}{abs(v):.1f}%"
        return f"{icon}{abs(v):,.2f}"

    @staticmethod
    def format_number(value, locale: str = "en") -> str:
        """
        Simplify large numbers.
        English: 1500000 → "1.5M", 120000000 → "120M"
        Chinese: 1500000 → "150万", 120000000 → "1.2亿"
        """
        v = float(value)
        abs_v = abs(v)
        sign = "-" if v < 0 else ""

        if locale == "zh":
            if abs_v >= 100_000_000:
                return f"{sign}{abs_v / 100_000_000:.1f}亿"
            elif abs_v >= 10_000:
                return f"{sign}{abs_v / 10_000:.1f}万"
            else:
                return f"{sign}{abs_v:,.0f}"
        else:
            if abs_v >= 1_000_000_000:
                return f"{sign}{abs_v / 1_000_000_000:.1f}B"
            elif abs_v >= 1_000_000:
                return f"{sign}{abs_v / 1_000_000:.1f}M"
            elif abs_v >= 1_000:
                return f"{sign}{abs_v / 1_000:.1f}K"
            else:
                return f"{sign}{abs_v:,.0f}"

    @staticmethod
    def format_duration(days: int) -> str:
        """Format days into human-readable duration."""
        if days < 0:
            return "unlimited"
        if days < 7:
            return f"{days}d"
        weeks = days // 7
        remaining = days % 7
        if remaining == 0:
            return f"{weeks}w"
        return f"{weeks}w {remaining}d"

    @staticmethod
    def status_badge(status: str) -> str:
        """Return status with emoji badge."""
        badges = {
            "healthy": "🟢 Healthy",
            "warning": "🟡 Warning",
            "critical": "🔴 Critical",
            "up": "📈 Up",
            "down": "📉 Down",
            "flat": "➡️ Flat",
        }
        return badges.get(status, status)

    @staticmethod
    def format_table_row(data: dict, columns: list[str]) -> list[str]:
        """Format a dict as a table row."""
        return [str(data.get(col, "-")) for col in columns]
