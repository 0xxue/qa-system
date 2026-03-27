"""
Unified Calculator

High-precision calculations using Decimal.
AI can't do math reliably — this module handles all numerical computations.

Provides: statistics, growth/trend analysis, ratios, predictions, aggregation.
Industry-agnostic — works for any domain that needs precise numbers.
"""

from decimal import Decimal, ROUND_HALF_UP
from typing import Optional
import structlog

logger = structlog.get_logger()


class Calculator:
    """
    High-precision calculator using Decimal to avoid floating-point errors.
    """

    def __init__(self, precision: int = 2):
        self.precision = precision

    def _d(self, value) -> Decimal:
        """Convert to Decimal safely."""
        if isinstance(value, Decimal):
            return value
        return Decimal(str(value))

    def _round(self, value: Decimal) -> Decimal:
        return value.quantize(Decimal(f"0.{'0' * self.precision}"), rounding=ROUND_HALF_UP)

    # ========== Basic Statistics ==========

    def average(self, values: list) -> Decimal:
        """Calculate average of a list of values."""
        if not values:
            return Decimal("0")
        total = sum(self._d(v) for v in values)
        return self._round(total / len(values))

    def growth_rate(self, old_value, new_value) -> Decimal:
        """Calculate growth rate: (new - old) / old * 100."""
        old = self._d(old_value)
        new = self._d(new_value)
        if old == 0:
            return Decimal("0")
        rate = (new - old) / old * 100
        return self._round(rate)

    def trend(self, values: list) -> dict:
        """Analyze trend from a list of values."""
        if len(values) < 2:
            return {"direction": "insufficient_data", "change": Decimal("0")}
        first = self._d(values[0])
        last = self._d(values[-1])
        change = last - first
        rate = self.growth_rate(first, last) if first != 0 else Decimal("0")
        direction = "up" if change > 0 else "down" if change < 0 else "flat"
        return {
            "direction": direction,
            "change": self._round(change),
            "rate": rate,
            "start": self._round(first),
            "end": self._round(last),
        }

    def comparison(self, value_a, value_b) -> dict:
        """Compare two values."""
        a = self._d(value_a)
        b = self._d(value_b)
        diff = a - b
        rate = self.growth_rate(b, a) if b != 0 else Decimal("0")
        return {
            "value_a": self._round(a),
            "value_b": self._round(b),
            "difference": self._round(diff),
            "rate": rate,
            "larger": "a" if a > b else "b" if b > a else "equal",
        }

    # ========== Ratio & Rate ==========

    def ratio(self, numerator, denominator, name: str = "ratio") -> dict:
        """Generic ratio calculation."""
        n = self._d(numerator)
        d = self._d(denominator)
        if d == 0:
            return {name: Decimal("0"), "status": "division_by_zero"}
        r = n / d
        return {name: self._round(r)}

    def burn_rate(self, balance, daily_cost) -> dict:
        """
        How many days can a resource last?
        Applicable to budgets, inventory, storage, etc.
        """
        bal = self._d(balance)
        cost = self._d(daily_cost)
        if cost == 0:
            return {"days": -1, "status": "no_consumption"}
        days = bal / cost
        return {
            "balance": self._round(bal),
            "daily_cost": self._round(cost),
            "days_remaining": int(days),
            "weeks_remaining": int(days / 7),
            "status": "critical" if days < 7 else "warning" if days < 30 else "healthy",
        }

    def margin(self, income, cost) -> dict:
        """Calculate margin: (income - cost) / income * 100."""
        inc = self._d(income)
        c = self._d(cost)
        profit = inc - c
        pct = (profit / inc * 100) if inc != 0 else Decimal("0")
        return {
            "income": self._round(inc),
            "cost": self._round(c),
            "profit": self._round(profit),
            "margin_pct": self._round(pct),
        }

    # ========== Prediction ==========

    def linear_prediction(self, values: list, future_steps: int = 7) -> dict:
        """
        Simple linear trend prediction.
        Fits a line through the data and extrapolates.
        """
        if len(values) < 2:
            return {"error": "Need at least 2 data points"}

        n = len(values)
        x_vals = list(range(n))
        y_vals = [self._d(v) for v in values]

        sum_x = sum(x_vals)
        sum_y = sum(y_vals)
        sum_xy = sum(self._d(x) * y for x, y in zip(x_vals, y_vals))
        sum_x2 = sum(self._d(x) ** 2 for x in x_vals)

        denominator = self._d(n) * sum_x2 - self._d(sum_x) ** 2
        if denominator == 0:
            return {"error": "Cannot fit line (all x values same)"}

        m = (self._d(n) * sum_xy - self._d(sum_x) * sum_y) / denominator
        b = (sum_y - m * self._d(sum_x)) / self._d(n)

        predictions = []
        for i in range(n, n + future_steps):
            pred = m * self._d(i) + b
            predictions.append(self._round(pred))

        return {
            "slope": self._round(m),
            "intercept": self._round(b),
            "predictions": predictions,
            "trend": "up" if m > 0 else "down" if m < 0 else "flat",
        }

    # ========== Analytics ==========

    def distribution_analysis(self, items: list, amount_key: str = "amount") -> dict:
        """Analyze distribution of items by amount."""
        total = len(items)
        if total == 0:
            return {"total": 0, "summary": "No items"}

        total_amount = sum(self._d(p.get(amount_key, 0)) for p in items)
        avg_amount = total_amount / total

        return {
            "total_items": total,
            "total_amount": self._round(total_amount),
            "average_amount": self._round(avg_amount),
        }

    def engagement_analysis(self, total: int, active: int, new: int) -> dict:
        """Engagement metrics (users, devices, entities, etc.)."""
        active_rate = self._d(active) / self._d(total) * 100 if total > 0 else Decimal("0")
        new_rate = self._d(new) / self._d(total) * 100 if total > 0 else Decimal("0")
        return {
            "total": total,
            "active": active,
            "new": new,
            "active_rate": self._round(active_rate),
            "new_rate": self._round(new_rate),
        }

    def aggregate(self, values: list, operation: str = "sum") -> Decimal:
        """Generic aggregation: sum, avg, min, max, count."""
        if not values:
            return Decimal("0")
        decimals = [self._d(v) for v in values]
        match operation:
            case "sum":
                return self._round(sum(decimals))
            case "avg":
                return self._round(sum(decimals) / len(decimals))
            case "min":
                return self._round(min(decimals))
            case "max":
                return self._round(max(decimals))
            case "count":
                return Decimal(str(len(values)))
            case _:
                return self._round(sum(decimals))
