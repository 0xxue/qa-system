# NexusAI — Open Source AI QA Platform

<p align="center">
  <img src="https://img.shields.io/badge/FastAPI-0.135-009688?style=for-the-badge&logo=fastapi&logoColor=white" />
  <img src="https://img.shields.io/badge/LangGraph-1.1-FF6F00?style=for-the-badge" />
  <img src="https://img.shields.io/badge/LiteLLM-1.77-412991?style=for-the-badge" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=white" />
  <img src="https://img.shields.io/badge/PostgreSQL-16+pgvector-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" />
  <img src="https://img.shields.io/badge/Three.js-VRM_3D_Bot-000?style=for-the-badge&logo=threedotjs" />
</p>

<p align="center">
  AI-powered QA system with 11-node Agentic RAG, pluggable 3D bot, and multi-model support.<br/>
  Ask questions in natural language, get data-driven answers with charts and source attribution.
</p>

<p align="center">
  <a href="https://demo-mu-jade.vercel.app/indexv2.html">Live Demo</a> &nbsp;|&nbsp;
  <a href="#quick-start">Quick Start</a> &nbsp;|&nbsp;
  <a href="#architecture">Architecture</a> &nbsp;|&nbsp;
  <a href="#%E4%B8%AD%E6%96%87%E8%AF%B4%E6%98%8E">中文说明</a>
</p>

---

## Quick Start

**One command to run everything:**

```bash
git clone https://github.com/0xxue/qa-system.git
cd qa-system
cp .env.example .env          # Add your LLM API key
docker compose up -d           # Start all services
```

Open http://localhost:3000 — that's it.

> Need an API key? Get a free one from [DeepSeek](https://platform.deepseek.com). Or use Ollama for fully local, free operation.

### Without Docker

```bash
# Backend
cd backend
pip install -e ".[dev]"
cp .env.example .env
alembic upgrade head
uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend-app
npm install
npm run dev
```

---

## Features

### AI QA Engine
- **11-Node Agentic RAG** — LangGraph workflow: intent detection → semantic search → data fetch → analysis → hallucination check → chart generation
- **Query Rewriting** — Unclear queries get rewritten and re-searched automatically
- **Dual Model Cross-Validation** — Low confidence answers get verified by a second model
- **Source Attribution** — Every answer cites exactly where the data came from
- **12 Chart Types** — AI recommends the best visualization, returns ECharts config

### Model Freedom
```env
PRIMARY_MODEL=deepseek/deepseek-chat    # Cheap & fast
PRIMARY_MODEL=anthropic/claude-sonnet-4-20250514  # Best quality
PRIMARY_MODEL=openai/gpt-4o             # Popular choice
PRIMARY_MODEL=ollama/llama3             # Free, local, no API key
```
Switch models with one line. No code changes needed.

### 3D Bot (Pluggable)
- VRM 3D character with 7 emotions + 3 actions
- Draggable, floats, follows mouse, reacts to AI state
- **Fully pluggable** — implement `BotPlugin` interface to use any character
- Disable with `ENABLE_AI_BOT=false`

### Frontend
- **NEXUS Design System** — Warm retro sci-fi aesthetic
- SSE streaming responses with real-time step display
- Conversation history (persisted to database)
- Knowledge base management UI
- Dashboard with real-time DB stats
- Mobile responsive

### Enterprise Middleware
- Circuit breaker (per-endpoint, configurable thresholds)
- Rate limiter (sliding window, burst support)
- Distributed tracing (request IDs across services)
- Structured logging (JSON format for production)
- Retry with exponential backoff
- RBAC + Audit trail

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Frontend (React 19 + TypeScript + NEXUS Design)            │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────┐  │
│  │   Chat   │ │    KB    │ │ Dashboard│ │  3D VRM Bot   │  │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └───────────────┘  │
│       └─────────────┴────────────┘                          │
│                     │ SSE / REST                            │
├─────────────────────┼───────────────────────────────────────┤
│  Backend (FastAPI)  │                                       │
│  ┌──────────────────┴──────────────────────────────────┐    │
│  │  LangGraph (11-Node Agentic RAG Workflow)           │    │
│  │                                                     │    │
│  │  detect_intent → classify → rag_search → rerank     │    │
│  │       → fetch_data → check_sufficiency → analyze    │    │
│  │       → hallucination_check → generate_chart        │    │
│  │       → format_response                             │    │
│  │                                                     │    │
│  │  + rewrite_query (retry loop)                       │    │
│  │  + fallback (general knowledge)                     │    │
│  └─────────────────────────────────────────────────────┘    │
│       │              │              │                        │
│  ┌────┴────┐   ┌─────┴─────┐  ┌────┴────┐                  │
│  │ LiteLLM │   │ LightRAG  │  │  Data   │                  │
│  │ (any    │   │ (semantic  │  │ Service │                  │
│  │  model) │   │  search)   │  │ (APIs)  │                  │
│  └─────────┘   └───────────┘  └─────────┘                  │
├─────────────────────────────────────────────────────────────┤
│  PostgreSQL 16 + pgvector  │  Redis 7  │  Prometheus        │
└─────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + TypeScript + Vite + Zustand + ECharts |
| Design | NEXUS warm retro theme + Tailwind CSS |
| 3D Bot | Three.js + @pixiv/three-vrm (pluggable) |
| API | FastAPI (async) + Pydantic v2 + SSE |
| Orchestration | LangGraph (11-node state graph) |
| LLM | LiteLLM (Claude / GPT / DeepSeek / Ollama / any) |
| RAG | LightRAG (semantic hybrid search) |
| Embedding | sentence-transformers (free, local) / Ollama / OpenAI |
| Database | PostgreSQL 16 + pgvector + Alembic migrations |
| Cache | Redis 7 (multi-layer L1/L2) |
| Middleware | Circuit breaker, rate limiter, tracing, retry, RBAC |
| Deploy | Docker Compose, systemd, one-click deploy script |

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/qa/ask` | Single-shot QA |
| POST | `/api/v1/qa/stream` | SSE streaming QA |
| GET | `/api/v1/qa/conversations` | List conversations |
| GET | `/api/v1/qa/conversations/:id` | Get conversation + messages |
| DELETE | `/api/v1/qa/conversations/:id` | Delete conversation |
| GET | `/api/v1/data/*` | Business data endpoints |
| GET | `/api/v1/health` | Health check |
| GET | `/api/v1/stats` | System stats (DB) |

When `DEBUG=true`, Swagger docs available at `/docs`.

---

## Customization

### Add Your Data Sources

Edit `backend/app/services/rag.py` — update `API_DESCRIPTIONS`:

```python
API_DESCRIPTIONS = [
    {
        "name": "your_endpoint",
        "endpoint": "/api/v1/data/your/endpoint",
        "description": "What this endpoint does. Keywords for matching.",
    },
]
```

Then implement the endpoint in `backend/app/services/data_service.py`.

### Custom 3D Bot

Implement the `BotPlugin` interface:

```typescript
import type { BotPlugin } from './types/bot';

const myBot: BotPlugin = {
  mount(container) { /* render your bot */ },
  unmount() { /* cleanup */ },
  setEmotion(state) { /* idle|happy|angry|sad|thinking|talking|surprised */ },
  startTalking() { /* mouth animation */ },
  stopTalking() { /* stop */ },
  triggerAction(action) { /* wave|nod|think */ },
};

useBotStore.getState().setBotPlugin(myBot);
```

### Multilingual

The system automatically replies in the user's language. No configuration needed.

---

## Project Structure

```
qa-system/
├── backend/
│   ├── app/
│   │   ├── api/v1/          # REST endpoints
│   │   ├── core/
│   │   │   ├── langgraph/   # 11-node workflow (graph, nodes, state)
│   │   │   └── prompts/     # LLM prompt templates
│   │   ├── middleware/       # Circuit breaker, rate limiter, tracing...
│   │   ├── models/          # SQLAlchemy models (9 tables)
│   │   ├── services/        # Business logic (LLM, RAG, data, conversation...)
│   │   └── utils/           # Calculator, formatter, time series
│   ├── alembic/             # Database migrations
│   ├── tests/               # Unit tests
│   └── Dockerfile
├── frontend-app/
│   ├── src/
│   │   ├── components/
│   │   │   ├── bot/         # BotContainer + VRMBotPlugin
│   │   │   ├── ui/          # Button, Input, Modal, Toast, Badge
│   │   │   └── layout/      # Background decorations
│   │   ├── pages/           # Chat, KnowledgeBase, Dashboard
│   │   ├── store/           # Zustand (chat, bot)
│   │   ├── api/             # HTTP client + SSE streaming
│   │   └── types/           # TypeScript types + BotPlugin interface
│   └── Dockerfile
├── scripts/
│   └── deploy.py            # One-click deploy tool
├── docker-compose.yml        # Full stack: web + api + db + redis
└── .env.example
```

---

## Tests

```bash
cd backend
python -m pytest tests/ -v        # Unit tests (calculator, formatter, time series)
python scripts/test_qa.py          # Integration tests (API, QA, streaming)
```

---

## Deploy

### Docker (recommended)
```bash
docker compose up -d
```

### Manual (VPS)
```bash
python scripts/deploy.py deploy    # One-click: upload → migrate → restart → health check
python scripts/deploy.py status    # Check all services
python scripts/deploy.py logs      # View backend logs
python scripts/deploy.py rollback  # Rollback to last backup
```

---

## License

MIT

---

# 中文说明

## NexusAI — 开源 AI 智能问答平台

用自然语言提问，系统自动查数据、分析、生成图表。支持任意 LLM，带 3D 机器人。

### 一键启动

```bash
git clone https://github.com/0xxue/qa-system.git
cd qa-system
cp .env.example .env          # 填入 LLM API Key
docker compose up -d           # 启动所有服务
```

打开 http://localhost:3000 即可使用。

### 核心能力

- **11 节点 Agentic RAG** — LangGraph 工作流：意图识别 → 语义搜索 → 数据获取 → 分析 → 幻觉检测 → 图表生成
- **模型自由切换** — Claude / GPT / DeepSeek / Ollama，.env 一行切换
- **3D 机器人** — VRM 3D 角色，7 种表情 + 3 种动作，可插拔替换
- **多语言** — 自动根据用户语言回复（中文问中文答，英文问英文答）
- **对话持久化** — 保存到 PostgreSQL，历史记录可查
- **Dashboard** — 实时展示数据库统计数据
- **一键部署** — Docker Compose 或 deploy.py 脚本

### 技术栈

| 层 | 技术 |
|---|------|
| 前端 | React 19 + TypeScript + NEXUS 设计系统 + Three.js VRM |
| 后端 | FastAPI + LangGraph + LiteLLM + LightRAG |
| 数据库 | PostgreSQL 16 + pgvector + Redis 7 |
| 中间件 | 熔断器、限流器、链路追踪、结构化日志 |
| 部署 | Docker Compose / systemd / 一键脚本 |

---

<p align="center">
  <sub>Built by <a href="https://github.com/0xxue">0xxue</a> — Contributions welcome!</sub>
</p>
