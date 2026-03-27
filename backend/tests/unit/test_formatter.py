"""Unit tests for data formatter."""

from app.utils.formatter import DataFormatter as fmt


class TestCurrency:
    def test_usd(self):
        assert fmt.format_currency(1234.56) == "$1,234.56"

    def test_cny(self):
        assert fmt.format_currency(1234567.89, "CNY") == "¥1,234,567.89"

    def test_no_symbol(self):
        assert fmt.format_currency(1234.56, show_symbol=False) == "1,234.56"


class TestPercent:
    def test_basic(self):
        assert fmt.format_percent(12.5) == "12.50%"

    def test_with_trend(self):
        result = fmt.format_percent(12.5, show_trend=True)
        assert "↑" in result

    def test_negative_trend(self):
        result = fmt.format_percent(-5.2, show_trend=True)
        assert "↓" in result


class TestNumber:
    def test_english_m(self):
        assert fmt.format_number(1500000) == "1.5M"

    def test_english_k(self):
        assert fmt.format_number(1500) == "1.5K"

    def test_zh_wan(self):
        assert fmt.format_number(1500000, locale="zh") == "150.0万"

    def test_zh_yi(self):
        assert fmt.format_number(120000000, locale="zh") == "1.2亿"

    def test_small(self):
        assert fmt.format_number(500) == "500"


class TestDuration:
    def test_days(self):
        assert fmt.format_duration(3) == "3d"

    def test_weeks(self):
        assert fmt.format_duration(14) == "2w"

    def test_weeks_days(self):
        assert fmt.format_duration(45) == "6w 3d"


class TestTrend:
    def test_up(self):
        assert "↑" in fmt.format_trend(12.5)

    def test_down(self):
        assert "↓" in fmt.format_trend(-5.2)
