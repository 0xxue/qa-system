# AI Bot Engine — Enterprise Embedded AI Assistant

> Not a standalone chatbot — an intelligent companion embedded into business systems.
> It knows what you're looking at, knows what's happening, and speaks proactively.
> **Dual distribution: npm package (frontend) + pluggable backend module.**

---

## 1. Product Positioning

**Embedded AI Assistant Engine**

Traditional chatbot: user asks → AI answers. Passive.

Our bot:
- User logs in → "Welcome back! 3 items expiring today need attention"
- User navigates to Dashboard → "Here's the overview. Budget consumption increased 15% this week"
- Data anomaly detected → Bot proactively pops up "Alert: expiring items 200% above normal"
- User can talk/type questions anytime
- User chooses companion/assistant/quiet mode
- **VRM 3D character with 7 emotions + 3 actions, reacting to system state in real-time**

---

## 2. Distribution Architecture

```
┌─────────────────────────────────────────────────┐
│           @nexus/ai-bot (npm package)            │
│                                                  │
│  Frontend Bot Engine:                            │
│  - BotContainer (draggable, floating, resizable) │
│  - BotPlugin interface (swap any 3D/2D avatar)   │
│  - VRMBotPlugin (Three.js + @pixiv/three-vrm)   │
│  - EmotionEngine (7 emotions + 3 actions)        │
│  - WebSocket client                              │
│  - Voice engine (STT/TTS)                        │
│  - Scene detector (page events → bot reactions)  │
│  - Mode controller (companion/assistant/quiet)   │
│                                                  │
│  Install: npm install @nexus/ai-bot              │
│  Framework: React 19 + TypeScript + Zustand      │
└──────────────────────┬──────────────────────────┘
                       │ WebSocket (bidirectional)
┌──────────────────────▼──────────────────────────┐
│           Bot Server (pluggable module)           │
│                                                  │
│  Can run as:                                     │
│  A) Built-in module in qa-system                 │
│  B) Standalone microservice                      │
│  C) Serverless function                          │
│                                                  │
│  - WebSocket Manager (multi-user connections)    │
│  - Scene Handler (configurable scene → response) │
│  - Mode Controller (A/B/C priority filtering)    │
│  - Alert Service (scheduled data checks)         │
│  - Bot Brain (LangGraph integration)             │
│  - Persona Config (personality, tone, name)      │
│  - Emotion Mapper (context → emotion state)      │
│  - Voice Service (Whisper/TTS optional)          │
│                                                  │
│  Stack: FastAPI + WebSocket + LiteLLM            │
└─────────────────────────────────────────────────┘
```

---

## 3. Emotion System

### 3.1 Emotions (7 states)

| Emotion | Trigger | VRM Expression | Bot Behavior |
|---------|---------|---------------|-------------|
| `idle` | Default state, no activity | Neutral + auto blink | Gentle floating, subtle sway |
| `happy` | Task completed, positive feedback | Happy (smile) | Celebratory movement, cheerful speech |
| `thinking` | Processing query, analyzing data | Sad 0.3 (focused look) | Head tilt, "Let me think..." bubble |
| `talking` | Streaming AI response | Happy 0.3 + mouth animation | Mouth moves with speech rhythm |
| `surprised` | Anomaly detected, unexpected data | Surprised (wide eyes) | Quick reaction, alert bubble |
| `angry` | Error, system failure, repeated failures | Angry (frown) | Frustrated gesture, error notification |
| `sad` | No data found, user leaves, low confidence | Sad (droopy) | Apologetic tone, offer alternatives |

### 3.2 Actions (3 gestures)

| Action | Trigger | Animation |
|--------|---------|-----------|
| `wave` | User login, greeting, page welcome | Head tilt left-right (300ms cycle) |
| `nod` | Understood, confirmed, task accepted | Head nod up-down (200ms steps) |
| `think` | Complex query, long processing | Head tilt + pause (2s hold) |

### 3.3 Emotion Mapping Rules

```python
EMOTION_MAP = {
    # System events → emotions
    "login": "happy",
    "logout": "sad",
    "page_change": "idle",
    "error": "angry",
    "anomaly_detected": "surprised",

    # QA flow → emotions
    "query_received": "thinking",
    "searching_data": "thinking",
    "analyzing": "thinking",
    "streaming_answer": "talking",
    "answer_complete": "happy",
    "answer_failed": "sad",
    "low_confidence": "sad",
    "high_confidence": "happy",

    # User interaction → emotions
    "user_feedback_positive": "happy",
    "user_feedback_negative": "sad",
    "user_drag_bot": "surprised",
    "user_click_bot": "surprised",
    "idle_timeout_30s": "idle",
}
```

---

## 4. Three Interaction Modes

| Mode | Name | Behavior | Use Case |
|------|------|----------|----------|
| **A** | Companion | High frequency: page intros, data alerts, proactive suggestions, idle chat | New users, onboarding |
| **B** | Assistant | Medium: only alerts on anomalies and key actions, answers when asked | Daily use (default) |
| **C** | Quiet | Low: only critical alerts, minimized in corner | Power users, focus mode |

```python
class ModeController:
    THRESHOLDS = {
        "A": 0,    # Companion: push everything
        "B": 2,    # Assistant: medium and above
        "C": 4,    # Quiet: critical only
    }

    PRIORITY_LEVELS = {
        "low": 1,
        "medium": 2,
        "high": 3,
        "critical": 4,
    }

    def should_push(self, mode: str, priority: str) -> bool:
        return self.PRIORITY_LEVELS.get(priority, 0) >= self.THRESHOLDS.get(mode, 2)
```

---

## 5. Scene System (Configurable)

```python
# Scenes can be configured via JSON/database, not hardcoded
SCENES = {
    "login": {
        "priority": "high",
        "emotion": "happy",
        "action": "wave",
        "template": "Welcome back, {username}! {summary}",
        "data_action": "fetch_daily_summary",
    },
    "page:dashboard": {
        "priority": "medium",
        "emotion": "idle",
        "template": "Here's the system overview. {highlight}",
        "data_action": "fetch_system_overview",
    },
    "page:kb": {
        "priority": "low",
        "emotion": "idle",
        "template": "This is the knowledge base. Upload documents and I can answer questions about them.",
        "data_action": None,
    },
    "page:settings": {
        "priority": "low",
        "emotion": "idle",
        "template": "Settings page. You can change my personality or switch to quiet mode here.",
        "data_action": None,
    },
    "data:anomaly": {
        "priority": "critical",
        "emotion": "surprised",
        "action": "nod",
        "template": "⚠️ Anomaly detected: {detail}",
        "data_action": "fetch_anomaly_detail",
    },
    "data:expiry_warning": {
        "priority": "high",
        "emotion": "surprised",
        "template": "📌 Reminder: {count} items expiring soon",
        "data_action": "fetch_expiring_items",
    },
    "qa:complete": {
        "priority": "low",
        "emotion": "happy",
        "action": "nod",
        "template": None,  # No speech, just emotion change
    },
    "qa:error": {
        "priority": "medium",
        "emotion": "sad",
        "template": "Sorry, I couldn't process that. {error}",
    },
}
```

---

## 6. WebSocket Protocol

### Client → Server

```json
{"type": "scene", "scene": "page:dashboard"}
{"type": "scene", "scene": "login", "data": {"username": "Alice"}}
{"type": "chat", "message": "How's the budget looking?"}
{"type": "voice", "audio": "base64..."}
{"type": "mode_change", "mode": "A"}
{"type": "emotion_sync", "emotion": "idle"}
```

### Server → Client

```json
{"type": "bot_message", "content": "Welcome back!", "emotion": "happy", "action": "wave", "priority": "high"}
{"type": "bot_message", "content": "...", "emotion": "talking", "chart": {...}, "sources": [...]}
{"type": "bot_emotion", "emotion": "thinking"}
{"type": "bot_action", "action": "nod"}
{"type": "bot_alert", "content": "3 items expiring today", "emotion": "surprised", "priority": "high"}
{"type": "mode_config", "mode": "B", "behavior": {...}}
```

---

## 7. Bot Persona (Configurable)

```python
PERSONAS = {
    "nexus": {
        "name": "Nexus",
        "personality": "Professional, concise, friendly",
        "language": "auto",  # Matches user language
        "system_prompt": """You are Nexus, an enterprise AI assistant.
Style: Professional but warm, concise but not cold.
Rules:
1. Base answers on real data, never fabricate
2. Clearly state when data is insufficient
3. Bold important numbers
4. Use emoji sparingly
5. Match the user's language""",
        "greeting": "Hi! I'm Nexus. How can I help?",
        "avatar": "vrm_default",
    },
    "casual": {
        "name": "Buddy",
        "personality": "Cheerful, humorous, talkative",
        "system_prompt": "You are Buddy, a cheerful AI assistant...",
        "greeting": "Hey there! What's up? 🎉",
        "avatar": "vrm_casual",
    },
}
```

---

## 8. BotPlugin Interface (Frontend)

Any avatar implementation must follow this interface:

```typescript
interface BotPlugin {
  mount(container: HTMLElement): void;
  unmount(): void;
  setEmotion(state: BotEmotion): void;    // 7 emotions
  startTalking(): void;                     // Mouth animation
  stopTalking(): void;
  triggerAction?(action: BotAction): void;  // 3 actions
}

type BotEmotion = 'idle' | 'happy' | 'angry' | 'sad' | 'thinking' | 'talking' | 'surprised';
type BotAction = 'wave' | 'nod' | 'think';
```

**Built-in implementations:**
- `VRMBotPlugin` — 3D VRM character (Three.js + @pixiv/three-vrm)
- Users can create custom plugins: 2D sprite, Lottie animation, CSS character, etc.

---

## 9. Database Tables

```sql
-- Bot message history
bot_messages (
    id, user_id, direction,      -- "bot_to_user" / "user_to_bot"
    type,                         -- "scene" / "chat" / "alert" / "voice"
    content, scene, priority,
    emotion,                      -- emotion at time of message
    mode_at_time,                 -- user's mode when sent
    created_at
)

-- User bot preferences
user_bot_preferences (
    id, user_id,
    mode,                         -- "A" / "B" / "C"
    persona,                      -- "nexus" / "casual" / custom
    voice_enabled,
    tts_provider,                 -- "browser" / "openai" / "edge"
    position_x, position_y,       -- Remember bot position
    bot_size,                     -- Remember bot size
    minimized,
    updated_at
)

-- Scene configuration (editable via admin)
bot_scenes (
    id, scene_key,                -- "login" / "page:dashboard" / "data:anomaly"
    priority,                     -- "low" / "medium" / "high" / "critical"
    emotion,                      -- bot emotion for this scene
    action,                       -- bot action (wave/nod/think/null)
    template,                     -- "Welcome back, {username}!"
    data_action,                  -- API to call for dynamic data
    is_active,
    updated_at
)
```

---

## 10. File Structure

### Backend (pluggable module)

```
backend/app/
├── api/v1/
│   ├── bot.py                    # Bot REST API (config, mode, persona)
│   └── ws.py                     # WebSocket endpoint
├── services/
│   ├── bot_brain.py              # Bot brain (integrates LangGraph)
│   ├── bot_persona.py            # Persona management
│   ├── bot_emotion.py            # Emotion mapping engine
│   ├── alert_service.py          # Scheduled data checks → proactive alerts
│   ├── scene_handler.py          # Scene config → bot response
│   ├── mode_controller.py        # A/B/C mode filtering
│   ├── voice_service.py          # STT/TTS (optional)
│   └── ws_manager.py             # WebSocket connection pool
├── models/
│   ├── bot_message.py
│   ├── bot_preference.py
│   └── bot_scene.py
└── schemas/
    └── bot.py
```

### Frontend (npm package)

```
@nexus/ai-bot/
├── src/
│   ├── components/
│   │   ├── BotContainer.tsx       # Main container (drag, float, resize)
│   │   ├── BotChatPanel.tsx       # Chat panel (message stream + input)
│   │   ├── BotModeSelector.tsx    # Mode switcher (A/B/C)
│   │   └── BotAlertBubble.tsx     # Alert popup animation
│   ├── plugins/
│   │   ├── VRMBotPlugin.ts        # 3D VRM character
│   │   └── types.ts               # BotPlugin interface
│   ├── hooks/
│   │   ├── useBotWebSocket.ts     # WebSocket connection
│   │   ├── useBotScene.ts         # Scene event triggering
│   │   └── useBotVoice.ts         # Voice I/O
│   ├── store/
│   │   └── botStore.ts            # Zustand state
│   └── index.ts                   # Package entry point
├── package.json
└── README.md
```

---

## 11. Development Phases

### Phase A: WebSocket + Scene Awareness (Core)
1. WebSocket manager (ws_manager.py)
2. Scene handler (scene_handler.py) + emotion mapping
3. Mode controller (mode_controller.py)
4. Bot REST API (config, mode, persona)
5. Login greeting + page introductions
6. Frontend WebSocket hook + scene detector

### Phase B: Proactive Alerts
7. Scheduled check service (alert_service.py)
8. Expiry warning + anomaly detection
9. WebSocket push with emotion/action

### Phase C: Persona + Enhanced Chat
10. Persona configuration (bot_persona.py)
11. Bot Brain integrating LangGraph (bot_brain.py)
12. Message history + bot conversation persistence

### Phase D: Voice
13. Browser Web Speech API (STT + TTS)
14. Optional: Cloud Whisper + OpenAI TTS

### Phase E: npm Package + Embed SDK
15. Extract frontend bot into standalone npm package
16. Embed SDK (bot-sdk.js) for external systems
17. Documentation + examples

---

## 12. Configuration (.env)

```env
# Bot
ENABLE_AI_BOT=true
BOT_PERSONA=nexus                         # nexus / casual / custom
BOT_DEFAULT_MODE=B                        # A(companion) / B(assistant) / C(quiet)
BOT_WEBSOCKET_PATH=/ws/bot

# Alerts
ALERT_EXPIRY_INTERVAL=300                 # Check expiring items every 5min
ALERT_ANOMALY_INTERVAL=60                 # Check anomalies every 1min

# Voice (optional)
VOICE_ENABLED=false
TTS_PROVIDER=browser                      # browser / openai / edge
STT_PROVIDER=browser                      # browser / whisper
```

---

*Ready to implement Phase A.*
