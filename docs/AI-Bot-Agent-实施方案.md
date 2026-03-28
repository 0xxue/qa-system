# AI Bot Agent — Implementation Plan

> Bot = LLM Brain + System Tools + Emotion Engine + WebSocket Real-time
> Not a chatbot. An AI Agent that can see, think, feel, and act.

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    Frontend (React)                               │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ VRM 3D Bot   │  │ Chat Panel   │  │ Scene Detector       │  │
│  │ 7 emotions   │  │ User ↔ Bot   │  │ Page change → event  │  │
│  │ 3 actions    │  │ messages     │  │ User action → event  │  │
│  │ BotPlugin    │  │              │  │ Idle → event         │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘  │
│         └─────────────────┼──────────────────────┘              │
│                           │ WebSocket                            │
└───────────────────────────┼──────────────────────────────────────┘
                            │
┌───────────────────────────▼──────────────────────────────────────┐
│                    Bot Server                                     │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                   WebSocket Manager                         │  │
│  │  Per-user connection pool, message routing, heartbeat       │  │
│  └────────────────────────┬───────────────────────────────────┘  │
│                           │                                      │
│  ┌────────────────────────▼───────────────────────────────────┐  │
│  │                   Bot Brain (AI Agent)                       │  │
│  │                                                             │  │
│  │  LLM (via LiteLLM) + Function Calling / Tool Use           │  │
│  │                                                             │  │
│  │  System Prompt:                                             │  │
│  │    "You are Nexus Bot. You can use these tools..."          │  │
│  │                                                             │  │
│  │  Available Tools:                                           │  │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐  │  │
│  │  │ Data Tools  │ │ KB Tools    │ │ Admin Tools         │  │  │
│  │  │             │ │             │ │                     │  │  │
│  │  │ get_stats   │ │ create_kb   │ │ list_users          │  │  │
│  │  │ get_metrics │ │ upload_doc  │ │ change_role         │  │  │
│  │  │ search_data │ │ search_kb   │ │ get_audit_logs      │  │  │
│  │  │ get_items   │ │ delete_doc  │ │ get_usage_stats     │  │  │
│  │  └─────────────┘ └─────────────┘ └─────────────────────┘  │  │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐  │  │
│  │  │ Chat Tools  │ │ System Tools│ │ Custom Tools        │  │  │
│  │  │             │ │             │ │ (user-defined)      │  │  │
│  │  │ qa_ask      │ │ health_check│ │                     │  │  │
│  │  │ list_convs  │ │ get_config  │ │ register_tool()     │  │  │
│  │  │ delete_conv │ │ set_mode    │ │ any external API    │  │  │
│  │  └─────────────┘ └─────────────┘ └─────────────────────┘  │  │
│  │                                                             │  │
│  │  Decision Flow:                                             │  │
│  │  User message → LLM decides:                                │  │
│  │    a) Direct answer (no tool needed)                        │  │
│  │    b) Call tool → execute → return result to LLM → answer   │  │
│  │    c) Multi-step: tool1 → tool2 → ... → final answer       │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                           │                                      │
│  ┌────────────────────────▼───────────────────────────────────┐  │
│  │                   Emotion Engine                            │  │
│  │                                                             │  │
│  │  Input: LLM response + tool result + context                │  │
│  │  Output: emotion + action + speech                          │  │
│  │                                                             │  │
│  │  Rules:                                                     │  │
│  │  - Tool success → happy + nod                               │  │
│  │  - Tool failed → sad                                        │  │
│  │  - Thinking/processing → thinking                           │  │
│  │  - Anomaly alert → surprised                                │  │
│  │  - User greeting → happy + wave                             │  │
│  │  - Error → angry                                            │  │
│  │  - LLM can also explicitly set emotion via tool             │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                           │                                      │
│  ┌────────────┐ ┌─────────▼──────┐ ┌──────────────────────────┐  │
│  │ Scene      │ │ Mode           │ │ Alert Service            │  │
│  │ Handler    │ │ Controller     │ │ (Background)             │  │
│  │            │ │                │ │                          │  │
│  │ page event │ │ A: companion   │ │ Cron: check anomalies    │  │
│  │ → template │ │ B: assistant   │ │ Cron: check expiry       │  │
│  │ → emotion  │ │ C: quiet       │ │ → WebSocket push         │  │
│  │ → action   │ │ filter by      │ │ → emotion + action       │  │
│  │            │ │ priority       │ │                          │  │
│  └────────────┘ └────────────────┘ └──────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 2. Bot Tools Definition

Tools are the Bot's "hands". LLM decides which tool to call based on user intent.

```python
BOT_TOOLS = [
    # ── Data Tools ──
    {
        "name": "get_system_stats",
        "description": "Get system statistics: total users, conversations, messages, documents",
        "parameters": {},
        "handler": "bot_tools.get_system_stats",
        "requires_role": "user",
    },
    {
        "name": "get_metrics_summary",
        "description": "Get summary metrics: revenue, costs, profit, budget remaining",
        "parameters": {"period": {"type": "string", "enum": ["daily", "weekly", "monthly"]}},
        "handler": "bot_tools.get_metrics_summary",
        "requires_role": "user",
    },
    {
        "name": "get_user_stats",
        "description": "Get user statistics: total, active, retention, growth",
        "parameters": {},
        "handler": "bot_tools.get_user_stats",
    },
    {
        "name": "get_expiring_items",
        "description": "Get items expiring on a specific date",
        "parameters": {"date": {"type": "string", "description": "Date like 'today', 'tomorrow', or '2026-01-01'"}},
        "handler": "bot_tools.get_expiring_items",
    },

    # ── Knowledge Base Tools ──
    {
        "name": "create_kb_collection",
        "description": "Create a new knowledge base collection",
        "parameters": {
            "name": {"type": "string", "required": True},
            "description": {"type": "string"},
            "category": {"type": "string", "enum": ["general", "hr", "product", "technical", "policy", "finance"]},
        },
        "handler": "bot_tools.create_kb_collection",
        "requires_role": "user",
        "emotion_on_success": "happy",
        "action_on_success": "nod",
    },
    {
        "name": "search_knowledge_base",
        "description": "Search uploaded documents in the knowledge base",
        "parameters": {"query": {"type": "string", "required": True}},
        "handler": "bot_tools.search_kb",
    },
    {
        "name": "list_kb_collections",
        "description": "List all knowledge base collections",
        "parameters": {},
        "handler": "bot_tools.list_collections",
    },

    # ── Conversation Tools ──
    {
        "name": "ask_qa_system",
        "description": "Ask the AI QA system a data analysis question (uses full RAG pipeline)",
        "parameters": {"query": {"type": "string", "required": True}},
        "handler": "bot_tools.ask_qa",
    },
    {
        "name": "list_conversations",
        "description": "List user's recent conversations",
        "parameters": {},
        "handler": "bot_tools.list_conversations",
    },
    {
        "name": "delete_conversation",
        "description": "Delete a conversation by ID",
        "parameters": {"conversation_id": {"type": "integer", "required": True}},
        "handler": "bot_tools.delete_conversation",
        "emotion_on_success": "nod",
    },

    # ── Admin Tools (admin role only) ──
    {
        "name": "list_users",
        "description": "List all users in the system (admin only)",
        "parameters": {},
        "handler": "bot_tools.list_users",
        "requires_role": "admin",
    },
    {
        "name": "change_user_role",
        "description": "Change a user's role (admin only)",
        "parameters": {
            "username": {"type": "string", "required": True},
            "role": {"type": "string", "enum": ["admin", "user", "readonly"], "required": True},
        },
        "handler": "bot_tools.change_user_role",
        "requires_role": "admin",
        "emotion_on_success": "happy",
    },

    # ── System Tools ──
    {
        "name": "get_health_status",
        "description": "Check system health: database, redis, API status",
        "parameters": {},
        "handler": "bot_tools.health_check",
    },
    {
        "name": "set_bot_emotion",
        "description": "Set the bot's current emotion state",
        "parameters": {"emotion": {"type": "string", "enum": ["idle", "happy", "angry", "sad", "thinking", "talking", "surprised"]}},
        "handler": "bot_tools.set_emotion",
    },
]
```

---

## 3. LLM Integration (Function Calling)

```python
# Bot Brain — the core AI Agent loop

async def bot_think(user_message: str, user: User, context: dict) -> BotResponse:
    """
    Main Bot AI loop:
    1. Build tool definitions from BOT_TOOLS
    2. Send to LLM with function calling
    3. If LLM returns tool_call → execute tool → feed result back to LLM
    4. Repeat until LLM returns final text response
    5. Map response to emotion + action
    """

    # Filter tools by user role
    available_tools = [t for t in BOT_TOOLS if user_has_access(user, t)]

    # Convert to LLM tool format (OpenAI function calling schema)
    tool_defs = [to_openai_tool(t) for t in available_tools]

    messages = [
        {"role": "system", "content": build_system_prompt(user, context)},
        {"role": "user", "content": user_message},
    ]

    # Agent loop (max 5 iterations to prevent infinite loops)
    for _ in range(5):
        response = await litellm.acompletion(
            model=settings.primary_model,
            messages=messages,
            tools=tool_defs,
            tool_choice="auto",
        )

        choice = response.choices[0].message

        # If LLM wants to call a tool
        if choice.tool_calls:
            for tool_call in choice.tool_calls:
                tool_name = tool_call.function.name
                tool_args = json.loads(tool_call.function.arguments)

                # Execute the tool
                result = await execute_tool(tool_name, tool_args, user)

                # Append tool result to messages
                messages.append(choice)  # assistant message with tool_call
                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "content": json.dumps(result, ensure_ascii=False),
                })

            continue  # Let LLM process the tool result

        # LLM returned final text answer
        return BotResponse(
            content=choice.content,
            emotion=determine_emotion(choice.content, context),
            action=determine_action(context),
        )

    return BotResponse(content="I got stuck in a loop. Please try again.", emotion="sad")
```

---

## 4. Bot Behavior System (前端行为引擎)

Bot 不只是浮在角落，它有完整的行为系统：

### 4.1 移动系统（Movement）

```typescript
// Bot 可以飞到页面任意位置
botMoveTo(x, y, {
  trail: true,       // 飞行轨迹粒子
  beacon: true,      // 目标点信标动画
  onArrive: () => {} // 到达回调
});

// 避让：当某个元素需要空间时（如输入框聚焦），Bot 自动让开
botMoveAwayFrom(elementRect);

// 回到默认位置
botMoveToDefault();
```

### 4.2 场景反应（Scene Reactions）

Bot 在用户切换页面时**飞到对应区域并说话**：

```typescript
const SCENE_REACTIONS = {
  '/chat': {
    position: { x: '85vw', y: '80vh' },    // 飞到右下角
    speech: "Let's chat! Ask me anything ▶",
    emotion: 'happy',
  },
  '/kb': {
    position: { x: '75vw', y: '35vh' },    // 飞到页面中部
    speech: 'Knowledge base management! ◈',
    emotion: 'thinking',
  },
  '/dashboard': {
    position: { x: '65vw', y: '20vh' },    // 飞到上方
    speech: 'Loading data dashboard... ◉',
    emotion: 'thinking',
    onArrive: () => setEmotion('happy'),
  },
  '/settings': {
    position: { x: '50vw', y: '50vh' },    // 页面正中
    speech: 'Settings! You can customize me here.',
    emotion: 'idle',
  },
};
```

### 4.3 新手引导（Feature Tour）

首次使用时，Bot 自动带用户游览系统：

```typescript
const TOUR_STEPS = [
  {
    target: '#sidebar',
    position: { x: '15vw', y: '15vh' },
    speech: 'This is the navigation bar ▶',
    emotion: 'talking',
  },
  {
    target: '#conv-list',
    position: { x: '25vw', y: '45vh' },
    speech: 'Conversation history is here ◈',
    emotion: 'talking',
  },
  {
    target: '#chat-input',
    position: { x: '50vw', y: '85vh' },
    speech: 'Type your question here, press Enter ▶',
    emotion: 'talking',
  },
  {
    target: null,
    position: 'default',
    speech: 'Tour complete! I\'ll be right here ◈',
    emotion: 'happy',
    action: 'wave',
  },
];

// 每步之间间隔 3s，Bot 飞行 + 说话 + 切表情
```

### 4.4 交互行为

| 行为 | 触发 | 响应 |
|------|------|------|
| **戳一戳** | 点击 Bot | 随机说话 + surprised 表情（"That tickles!", "Hey stop poking!"） |
| **拖拽** | 鼠标按住拖动 | 缩放 1.08 + 粒子轨迹 + surprised → 放下时说 "Put me down~" |
| **闲置聊天** | 30s 无操作 | 随机说一句（"Standing by~", "Ask me anything!", "I can help!"） |
| **输入框避让** | textarea 聚焦 | Bot 飞走让出空间 |
| **点击打开对话** | 双击 Bot | 弹出迷你对话面板 |
| **错误安慰** | API 报错 | sad + "Oops, something went wrong..." |
| **成功庆祝** | 操作完成 | happy + nod + "Done!" |

### 4.5 对话面板（Chat Panel）

点击/双击 Bot → 弹出迷你对话框（独立于主 Chat 页面）：

```
┌─────────────────────────────┐
│  🦀 Nexus Bot          ─ ✕  │  ← 可最小化/关闭
├─────────────────────────────┤
│                             │
│  Bot: 你好！需要帮忙吗？     │
│                             │
│  You: 帮我查系统状态         │
│                             │
│  Bot: [thinking → talking]  │
│  系统运行正常，5 个用户...    │
│                             │
├─────────────────────────────┤
│  [输入消息...]         [发送] │
│  🎤 语音                     │  ← Phase 4
└─────────────────────────────┘

特点：
- 走 WebSocket（不是 HTTP），Bot Brain 直接处理
- 支持工具调用（"帮我创建知识库" → 直接执行）
- 独立于主 Chat 页面（主 Chat 走 LangGraph 11 节点完整 QA）
- 对话历史存 bot_messages 表
- 可最小化到 Bot 身上（小红点提示未读）
```

### 4.6 移动轨迹粒子

```typescript
// Bot 飞行时留下粒子轨迹
function emitTrail(x: number, y: number) {
  // 3-8 个粒子，随机大小 4-10px
  // 颜色池：orange, cream, warm, amber
  // 动画：0.6-1s 淡出 + 上飘 + 缩小
}

// 信标：目标位置的脉冲圆圈
function showBeacon(x: number, y: number) {
  // 40px 圆圈，scale 1→1.2 循环动画
  // Bot 到达后消失
}
```

---

## 5. WebSocket Flow

```
User opens app
    │
    ├── Frontend connects WebSocket: ws://localhost:8000/ws/bot?token=jwt
    │
    ├── Server authenticates JWT → gets user_id, role
    │
    ├── Server sends: {"type": "connected", "mode": "B", "persona": "nexus"}
    │
    ├── Frontend sends scene: {"type": "scene", "scene": "login"}
    │   └── Server: Scene Handler → emotion: happy, action: wave
    │       └── Push: {"type": "bot_message", "content": "Welcome!", "emotion": "happy", "action": "wave"}
    │
    ├── User navigates to Dashboard
    │   └── Frontend: {"type": "scene", "scene": "page:dashboard"}
    │       └── Server: fetch overview → "Today looks good, 89 new users"
    │
    ├── User types: "帮我创建一个技术文档的知识库"
    │   └── Frontend: {"type": "chat", "message": "帮我创建一个技术文档的知识库"}
    │       └── Server: Bot Brain → LLM → tool_call: create_kb_collection
    │           └── Execute tool → success
    │               └── Push: {"type": "bot_message", "content": "已创建！", "emotion": "happy", "action": "nod"}
    │
    ├── Background Alert: anomaly detected
    │   └── Server: Alert Service → push to user
    │       └── Push: {"type": "bot_alert", "content": "⚠️ 异常!", "emotion": "surprised"}
    │
    └── User closes tab
        └── WebSocket disconnects → cleanup
```

---

## 5. Implementation Phases

### Phase 1: Core Agent + Behavior System (Week 1) ⭐
**Goal: Bot can chat, execute tools, move, and react to scenes**

Backend files:
```
backend/app/
├── api/v1/ws.py              # WebSocket endpoint
├── services/
│   ├── ws_manager.py          # Connection pool
│   ├── bot_brain.py           # LLM Agent loop with tool calling
│   ├── bot_tools.py           # Tool implementations (call real APIs)
│   └── bot_emotion.py         # Emotion mapping engine
```

Frontend files:
```
frontend-app/src/
├── components/bot/
│   ├── BotContainer.tsx       # Update: add moveTo, trail, beacon, scene reactions
│   ├── BotChatPanel.tsx       # NEW: mini chat dialog
│   ├── BotTrail.tsx           # NEW: flight trail particles
│   └── VRMBotPlugin.ts       # Existing: 3D avatar
├── hooks/
│   ├── useBotWebSocket.ts     # NEW: WebSocket connection + message handling
│   └── useBotScene.ts         # NEW: Route change → scene event
└── store/
    └── bot.ts                 # Update: add position, chatOpen, messages
```

Tasks:
1. **Backend:** `ws_manager.py` — WebSocket connection manager
2. **Backend:** `bot_tools.py` — 15+ tools calling existing APIs
3. **Backend:** `bot_brain.py` — LLM Agent loop with function calling
4. **Backend:** `bot_emotion.py` — Context → emotion + action mapping
5. **Backend:** `ws.py` — WebSocket endpoint with JWT auth
6. **Frontend:** `useBotWebSocket.ts` — Connect on mount, handle messages
7. **Frontend:** `useBotScene.ts` — Route change → send scene → Bot flies + speaks
8. **Frontend:** `BotChatPanel.tsx` — Click Bot → open mini chat dialog
9. **Frontend:** Movement system — `moveTo()` with trail particles + beacon
10. **Frontend:** Scene reactions — Page change → Bot flies to position + speaks
11. **Frontend:** Interactions — Poke (click), drag trail, idle chat, input avoidance
12. **Frontend:** Feature Tour — First-time guided tour

**Deliverables:**
- User types in Bot chat panel → Bot calls tools → returns answer with emotion
- User navigates pages → Bot flies to relevant area + speaks
- First visit → Bot guides user through features
- Click Bot → "That tickles!" + surprised face
- 30s idle → Bot says random phrase

### Phase 2: Scene Awareness (Week 2)
**Goal: Bot reacts to page navigation and system events**

Files to create:
```
backend/app/services/
│   ├── scene_handler.py       # Scene config → response
│   └── mode_controller.py     # A/B/C mode filtering
```

Tasks:
1. `scene_handler.py` — Configurable scene → template + emotion + action
2. `mode_controller.py` — Priority-based message filtering
3. Frontend: Scene detector (route change → send scene event)
4. Frontend: Mode selector in Settings
5. Store scene config in database (admin editable)

**Deliverable:** Navigate to Dashboard → Bot says "Here's the overview" with relevant data

### Phase 3: Proactive Alerts (Week 2-3)
**Goal: Bot proactively pushes alerts**

Files to create:
```
backend/app/services/
│   └── alert_service.py       # Background scheduled checks
```

Tasks:
1. `alert_service.py` — Background task checking data anomalies
2. Integrate with WebSocket push
3. Respect mode controller (quiet mode = critical only)

**Deliverable:** Data anomaly → Bot pops up with warning

### Phase 4: Persona + Voice (Week 3-4)
**Goal: Customizable personality + voice I/O**

Tasks:
1. Persona configuration (name, tone, system prompt)
2. Browser Web Speech API (STT + TTS)
3. Optional cloud TTS (OpenAI, Edge TTS)

### Phase 5: npm Package (Week 4+)
**Goal: Independent distributable package**

Tasks:
1. Extract frontend bot into `@nexus/ai-bot` npm package
2. Extract backend into `nexus-bot-engine` pip package
3. Documentation + examples
4. Published to npm + PyPI

---

## 6. Tool Registration (For External Integration)

Other projects can register custom tools:

```python
from nexus_bot import BotEngine

bot = BotEngine()

# Register a custom tool
@bot.tool(
    name="check_inventory",
    description="Check product inventory levels",
    parameters={"product_id": {"type": "string"}},
)
async def check_inventory(product_id: str):
    # Your custom logic
    result = await your_api.get_inventory(product_id)
    return {"stock": result.stock, "warehouse": result.location}

# Now users can say "check inventory for product-123"
# LLM will call check_inventory("product-123") automatically
```

---

## 7. Database Migration

```sql
-- Migration 004: Bot tables

-- Bot message history
CREATE TABLE bot_messages (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    direction VARCHAR(20) NOT NULL,       -- 'bot_to_user' / 'user_to_bot'
    type VARCHAR(20) NOT NULL,            -- 'chat' / 'scene' / 'alert' / 'tool_call'
    content TEXT,
    emotion VARCHAR(20),
    action VARCHAR(20),
    tool_name VARCHAR(50),                -- which tool was called
    tool_result JSONB,                    -- tool execution result
    scene VARCHAR(50),
    priority VARCHAR(20),
    mode_at_time VARCHAR(5),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Bot scene configuration
CREATE TABLE bot_scenes (
    id SERIAL PRIMARY KEY,
    scene_key VARCHAR(50) UNIQUE NOT NULL,
    priority VARCHAR(20) DEFAULT 'medium',
    emotion VARCHAR(20) DEFAULT 'idle',
    action VARCHAR(20),
    template TEXT,
    data_action VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Index for quick lookups
CREATE INDEX ix_bot_messages_user_id ON bot_messages(user_id);
CREATE INDEX ix_bot_messages_created ON bot_messages(created_at);
CREATE INDEX ix_bot_scenes_key ON bot_scenes(scene_key);
```

---

## 8. Success Criteria

| Criteria | Target |
|----------|--------|
| Bot can answer questions | Via LLM, same quality as QA system |
| Bot can execute 15+ tools | Create KB, delete conversation, check stats, etc. |
| Bot shows correct emotion | Matches context: thinking while processing, happy on success |
| Bot reacts to page changes | Scene-aware, mode-filtered |
| Bot pushes proactive alerts | Background checks, priority-filtered |
| Response time | < 3s for tool calls, < 10s for LLM answers |
| WebSocket stable | Reconnect on disconnect, heartbeat |
| Other projects can integrate | npm package + pip package + documentation |

---

*Ready to start Phase 1.*
