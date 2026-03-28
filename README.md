<p align="center">
  <img src="img/login.png" width="300" />
</p>

<h1 align="center">NexusAI</h1>
<p align="center">
  <strong>Enterprise AI Intelligence System</strong><br/>
  Agentic RAG + 3D AI Bot + Knowledge Base + Real-time Dashboard
</p>

<p align="center">
  <a href="https://demo-mu-jade.vercel.app/indexv2.html"><strong>Live Demo (3D Bot)</strong></a>
</p>

<p align="center">
  <a href="#features">Features</a> |
  <a href="#screenshots">Screenshots</a> |
  <a href="#quick-start">Quick Start</a> |
  <a href="#architecture">Architecture</a> |
  <a href="#tech-stack">Tech Stack</a> |
  <a href="#project-structure">Structure</a>
</p>

---

## Features

- **11-Node Agentic RAG Pipeline** -- LangGraph workflow with query rewriting, reranking, hallucination detection, and dual-model cross-validation
- **Multi-turn Conversations** -- Context window (last 10 messages) + auto-compression (summarize when > 8 messages) for infinite conversations
- **Knowledge Base** -- Upload documents (PDF, DOCX, TXT), pgvector semantic search, tag/category filtering
- **3D AI Bot (Clawford)** -- VRM character with 7 emotions, 3 actions, 14 system tools, voice dialogue, scene awareness
- **Real-time Dashboard** -- System metrics, charts, health monitoring
- **Enterprise Auth** -- JWT + RBAC (admin/user/readonly) + refresh tokens + audit logs
- **Voice System** -- Pluggable STT/TTS (Browser native, Edge TTS, OpenAI TTS)
- **Bot Management** -- Scene editor, message history, alert config, usage stats
- **NEXUS Design System** -- Warm retro aesthetic with custom typography and animations
- **Docker One-Click Deploy** -- `docker compose up` and you're running

## Screenshots

<table>
  <tr>
    <td><img src="img/chat-home.png" width="400" /><br/><sub>Chat -- Ready for Launch</sub></td>
    <td><img src="img/chat-analysis.png" width="400" /><br/><sub>Chat -- AI Analysis with Sources</sub></td>
  </tr>
  <tr>
    <td><img src="img/dashboard.png" width="400" /><br/><sub>Dashboard -- Real-time Metrics</sub></td>
    <td><img src="img/bot-chat.png" width="400" /><br/><sub>Bot -- Clawford Chat Panel</sub></td>
  </tr>
  <tr>
    <td><img src="img/settings.png" width="400" /><br/><sub>Settings -- Persona, Voice, Theme</sub></td>
    <td><img src="img/login.png" width="400" /><br/><sub>Login -- Auth System</sub></td>
  </tr>
</table>

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 18+
- PostgreSQL 15+ (with pgvector extension)
- Redis

### 1. Clone

```bash
git clone https://github.com/0xxue/nexus-ai.git
cd nexus-ai
```

### 2. Backend

```bash
cd backend
cp .env.example .env
# Edit .env -- add your LLM API key (DeepSeek free tier works)

pip install -r requirements.txt
alembic upgrade head
python -m uvicorn app.main:app --host 0.0.0.0 --port 8001
```

### 3. Frontend

```bash
cd frontend-app
npm install
npm run dev
```

Open http://localhost:5173

### Docker (Recommended)

```bash
cp .env.example .env
# Edit .env with your API key
docker compose up -d
```

Open http://localhost:3000

## Architecture

```
                         Frontend (React 19)
  +----------+  +----------+  +----------+  +------------+
  | Chat     |  | Dashboard|  | Know Base|  | Settings   |
  | (QA)     |  | (Charts) |  | (Upload) |  | (Persona)  |
  +----+-----+  +----+-----+  +----+-----+  +----+-------+
       |              |              |              |
  +----+--------------+--------------+--------------+-------+
  |              @nexus/ai-bot (3D Bot Engine)               |
  |  VRM Avatar | Voice | Scene Engine | Chat Panel          |
  +---------------------------+------------------------------+
                              | HTTP + WebSocket
  +---------------------------+------------------------------+
  |                    Backend (FastAPI)                      |
  |                                                          |
  |  +----------------------------------------------------+  |
  |  |           LangGraph (11-Node Pipeline)              |  |
  |  |  Intent > RAG > Fetch > Analyze > Chart > Format   |  |
  |  +----------------------------------------------------+  |
  |                                                          |
  |  +----------+  +----------+  +----------+  +----------+  |
  |  | Bot Brain|  | LiteLLM  |  | pgvector |  | Auth+RBAC|  |
  |  | 14 Tools |  | Multi-LLM|  | KB Search|  | JWT+Audit|  |
  |  +----------+  +----------+  +----------+  +----------+  |
  |                                                          |
  |  PostgreSQL (13 tables) + Redis (cache) + LightRAG       |
  +----------------------------------------------------------+
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite, Zustand, Tailwind CSS |
| 3D Bot | Three.js, @pixiv/three-vrm, Custom VRM expressions |
| Voice | Web Speech API, Edge TTS, OpenAI TTS |
| Backend | FastAPI, LangGraph, LiteLLM, Pydantic |
| LLM | DeepSeek (primary), GPT-4o (secondary), Claude (fallback) |
| Database | PostgreSQL + pgvector (HNSW), Redis |
| RAG | LightRAG + sentence-transformers (local embedding) |
| Auth | JWT (access + refresh), bcrypt, RBAC |
| Deploy | Docker Compose, Alembic migrations |

## Project Structure

```
nexus-ai/
├── backend/
│   ├── app/
│   │   ├── api/v1/          # REST + WebSocket endpoints
│   │   ├── core/
│   │   │   ├── langgraph/   # 11-node RAG pipeline
│   │   │   └── prompts/     # LLM prompt templates
│   │   ├── models/          # SQLAlchemy models (13 tables)
│   │   └── services/
│   │       ├── bot/         # Brain, Tools, Emotion, Alerts, Persistence
│   │       ├── llm.py       # LiteLLM unified interface
│   │       ├── rag.py       # LightRAG semantic search
│   │       └── kb_service.py # Knowledge base + pgvector
│   └── alembic/             # Database migrations (001-005)
│
├── frontend-app/
│   └── src/
│       ├── pages/           # Chat, Dashboard, KB, Settings, Admin, BotManage
│       └── components/      # UI components (NEXUS design system)
│
├── packages/
│   ├── ai-bot/              # @nexus/ai-bot (npm package)
│   │   └── src/             # BotContainer, VRM, Voice, Engine, Store
│   └── bot-admin/           # @nexus/bot-admin (npm package)
│       └── src/             # Scene editor, Stats, Messages, Settings
│
└── docker-compose.yml
```

## Related Projects

| Project | Description |
|---------|-------------|
| [@nexus/ai-bot](packages/ai-bot) | 3D AI Bot Engine -- drop into any React app |
| [@nexus/bot-admin](packages/bot-admin) | Bot Management UI -- scene editor, stats, settings |

## License

MIT
