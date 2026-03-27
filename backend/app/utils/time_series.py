"""
Time Series Builder

Handles missing data, trend detection, and anomaly identification
for time series data.
"""

from datetime import datetime, timedelta
from decimal import Decimal
from typing import Optional
import structlog

logger = structlog.get_logger()


class TimeSeriesBuilder:
    """Build and analyze time series data."""

    @staticmethod
    def fill_missing_dates(data: list[dict], date_key: str = "date", value_key: str = "value",
                           fill_value=0) -> list[dict]:
        """
        Fill missing dates in a time series.
        Input:  [{"date": "2025-01-01", "value": 10}, {"date": "2025-01-03", "value": 20}]
        Output: [{"date": "2025-01-01", "value": 10}, {"date": "2025-01-02", "value": 0},
                 {"date": "2025-01-03", "value": 20}]
        """
        if len(data) < 2:
            return data

        sorted_data = sorted(data, key=lambda x: x[date_key])
        start = datetime.strptime(sorted_data[0][date_key], "%Y-%m-%d")
        end = datetime.strptime(sorted_data[-1][date_key], "%Y-%m-%d")

        existing = {d[date_key]: d[value_key] for d in sorted_data}
        filled = []
        current = start

        while current <= end:
            date_str = current.strftime("%Y-%m-%d")
            filled.append({
                date_key: date_str,
                value_key: existing.get(date_str, fill_value),
                "_filled": date_str not in existing,
            })
            current += timedelta(days=1)

        return filled

    @staticmethod
    def detect_trend(values: list, window: int = 3) -> str:
        """
        Detect trend using moving average.
        Returns: "up", "down", or "flat"
        """
        if len(values) < window * 2:
            return "insufficient_data"

        first_window = sum(values[:window]) / window
        last_window = sum(values[-window:]) / window

        change_rate = (last_window - first_window) / first_window if first_window != 0 else 0

        if change_rate > 0.05:
            return "up"
        elif change_rate < -0.05:
            return "down"
        return "flat"

    @staticmethod
    def detect_anomalies(values: list, threshold: float = 2.0) -> list[dict]:
        """
        Detect anomalies using Z-score method.
        Returns indices and values of anomalous points.
        """
        if len(values) < 3:
            return []

        mean = sum(values) / len(values)
        variance = sum((v - mean) ** 2 for v in values) / len(values)
        std_dev = variance ** 0.5

        if std_dev == 0:
            return []

        anomalies = []
        for i, v in enumerate(values):
            z_score = abs(v - mean) / std_dev
            if z_score > threshold:
                anomalies.append({
                    "index": i,
                    "value": v,
                    "z_score": round(z_score, 2),
                    "direction": "high" if v > mean else "low",
                })

        return anomalies

    @staticmethod
    def moving_average(values: list, window: int = 7) -> list[Optional[float]]:
        """Calculate moving average."""
        if len(values) < window:
            return values

        result = [None] * (window - 1)
        for i in range(window - 1, len(values)):
            avg = sum(values[i - window + 1:i + 1]) / window
            result.append(round(avg, 2))
        return result

    @staticmethod
    def period_comparison(current: list, previous: list) -> dict:
        """Compare two periods (e.g., this week vs last week)."""
        curr_sum = sum(current)
        prev_sum = sum(previous)
        change = curr_sum - prev_sum
        rate = (change / prev_sum * 100) if prev_sum != 0 else 0

        return {
            "current_total": round(curr_sum, 2),
            "previous_total": round(prev_sum, 2),
            "change": round(change, 2),
            "change_rate": round(rate, 2),
            "direction": "up" if change > 0 else "down" if change < 0 else "flat",
        }
