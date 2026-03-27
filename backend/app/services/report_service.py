"""
Report Generator — Export analysis results as Markdown, HTML, PDF

Features:
- 3 output formats: Markdown / HTML / PDF
- 5 themes: default / business / modern / minimal / dark
- Embed charts, tables, key metrics
- Source attribution in every report
- Auto-generated from QA analysis results
"""

import json
import structlog
from datetime import datetime
from typing import Optional
from app.utils.formatter import DataFormatter

logger = structlog.get_logger()

fmt = DataFormatter()


class ReportGenerator:
    """Generate structured reports from QA analysis results."""

    THEMES = {
        "default": {
            "title_color": "#333",
            "accent_color": "#1a56a0",
            "bg_color": "#ffffff",
            "font": "system-ui, sans-serif",
        },
        "business": {
            "title_color": "#1a1a2e",
            "accent_color": "#16213e",
            "bg_color": "#f8f9fa",
            "font": "'Segoe UI', sans-serif",
        },
        "modern": {
            "title_color": "#2d3436",
            "accent_color": "#6c5ce7",
            "bg_color": "#ffffff",
            "font": "'Inter', sans-serif",
        },
        "minimal": {
            "title_color": "#000",
            "accent_color": "#000",
            "bg_color": "#fff",
            "font": "'Georgia', serif",
        },
        "dark": {
            "title_color": "#e0e0e0",
            "accent_color": "#58a6ff",
            "bg_color": "#0d1117",
            "font": "'JetBrains Mono', monospace",
        },
    }

    def __init__(self, theme: str = "default"):
        self.theme = self.THEMES.get(theme, self.THEMES["default"])
        self.theme_name = theme

    def generate_markdown(self, title: str, analysis: dict, query: str = "") -> str:
        """Generate Markdown report."""
        now = datetime.now().strftime("%Y-%m-%d %H:%M")
        sections = []

        # Header
        sections.append(f"# {title}")
        sections.append(f"\n> 生成时间：{now}")
        if query:
            sections.append(f"> 查询：{query}")
        sections.append("")

        # Key Metrics
        metrics = analysis.get("key_metrics", [])
        if metrics:
            sections.append("## 关键指标\n")
            sections.append("| 指标 | 数值 | 趋势 |")
            sections.append("|------|------|------|")
            for m in metrics:
                trend_icon = {"up": "📈", "down": "📉", "flat": "➡️"}.get(m.get("trend", ""), "")
                sections.append(f"| {m['name']} | {m['value']} | {trend_icon} {m.get('trend', '')} |")
            sections.append("")

        # Analysis
        answer = analysis.get("answer", "")
        if answer:
            sections.append("## 分析结果\n")
            sections.append(answer)
            sections.append("")

        # Confidence
        confidence = analysis.get("confidence", 0)
        sections.append(f"\n---\n")
        sections.append(f"**置信度：** {fmt.format_percent(confidence * 100)}")

        # Sources
        sources = analysis.get("sources", [])
        if sources:
            sections.append("\n## 数据来源\n")
            for i, src in enumerate(sources, 1):
                if isinstance(src, dict):
                    sections.append(f"{i}. [{src.get('type', 'unknown')}] {src.get('name', '')} — {src.get('query_time', '')}")
                else:
                    sections.append(f"{i}. {src}")

        # Suggestions
        suggestions = analysis.get("suggestions", [])
        if suggestions:
            sections.append("\n## 建议\n")
            for s in suggestions:
                sections.append(f"- {s}")

        # Footer
        sections.append(f"\n---\n*AI QA System V3 | {now}*")

        return "\n".join(sections)

    def generate_html(self, title: str, analysis: dict, query: str = "", chart_json: dict = None) -> str:
        """Generate HTML report with optional embedded chart."""
        md_content = self.generate_markdown(title, analysis, query)
        theme = self.theme

        # Convert markdown to basic HTML
        html_body = self._md_to_html(md_content)

        # Chart script (ECharts)
        chart_script = ""
        if chart_json:
            chart_script = f"""
            <div id="chart" style="width:100%;height:400px;margin:20px 0;"></div>
            <script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"></script>
            <script>
                var chart = echarts.init(document.getElementById('chart'));
                chart.setOption({json.dumps(chart_json, ensure_ascii=False)});
                window.addEventListener('resize', function() {{ chart.resize(); }});
            </script>
            """

        html = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title}</title>
    <style>
        body {{
            font-family: {theme['font']};
            background: {theme['bg_color']};
            color: {theme['title_color']};
            max-width: 800px;
            margin: 0 auto;
            padding: 40px 20px;
            line-height: 1.8;
        }}
        h1 {{ color: {theme['accent_color']}; border-bottom: 2px solid {theme['accent_color']}; padding-bottom: 10px; }}
        h2 {{ color: {theme['accent_color']}; margin-top: 30px; }}
        table {{ border-collapse: collapse; width: 100%; margin: 15px 0; }}
        th, td {{ border: 1px solid #ddd; padding: 10px 15px; text-align: left; }}
        th {{ background: {theme['accent_color']}22; font-weight: 600; }}
        blockquote {{ border-left: 4px solid {theme['accent_color']}; margin: 15px 0; padding: 10px 20px; background: #f8f9fa; }}
        code {{ background: #f0f0f0; padding: 2px 6px; border-radius: 3px; font-size: 0.9em; }}
        hr {{ border: none; border-top: 1px solid #ddd; margin: 30px 0; }}
        .metric-card {{ display: inline-block; background: #f8f9fa; border-radius: 8px; padding: 15px 25px; margin: 5px; text-align: center; }}
        .metric-value {{ font-size: 24px; font-weight: bold; color: {theme['accent_color']}; }}
        .metric-label {{ font-size: 12px; color: #888; }}
    </style>
</head>
<body>
{html_body}
{chart_script}
</body>
</html>"""
        return html

    def generate_pdf(self, title: str, analysis: dict, query: str = "", chart_json: dict = None) -> bytes:
        """
        Generate PDF report.
        Uses HTML → PDF conversion (requires weasyprint or similar).
        Falls back to returning HTML if PDF library not available.
        """
        html = self.generate_html(title, analysis, query, chart_json)

        try:
            from weasyprint import HTML
            pdf_bytes = HTML(string=html).write_pdf()
            logger.info("PDF report generated", title=title)
            return pdf_bytes
        except ImportError:
            logger.warning("weasyprint not installed, returning HTML instead")
            return html.encode("utf-8")

    def _md_to_html(self, md: str) -> str:
        """Simple markdown to HTML conversion."""
        try:
            import markdown
            return markdown.markdown(md, extensions=["tables", "fenced_code"])
        except ImportError:
            # Fallback: very basic conversion
            html = md
            lines = html.split("\n")
            result = []
            for line in lines:
                if line.startswith("# "):
                    result.append(f"<h1>{line[2:]}</h1>")
                elif line.startswith("## "):
                    result.append(f"<h2>{line[3:]}</h2>")
                elif line.startswith("### "):
                    result.append(f"<h3>{line[4:]}</h3>")
                elif line.startswith("> "):
                    result.append(f"<blockquote>{line[2:]}</blockquote>")
                elif line.startswith("- "):
                    result.append(f"<li>{line[2:]}</li>")
                elif line.startswith("---"):
                    result.append("<hr>")
                elif line.strip():
                    result.append(f"<p>{line}</p>")
            return "\n".join(result)
