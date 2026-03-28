/**
 * @nexus/ai-bot — 3D AI Bot Engine
 *
 * Embedded intelligent assistant with:
 * - Pluggable 3D/2D avatar (BotPlugin interface)
 * - Pluggable voice system (VoiceProvider interface)
 * - WebSocket real-time communication
 * - Event-driven scene/behavior system
 * - Built-in VRM (Three.js) avatar support
 *
 * Quick start:
 *   import { BotProvider, BotContainer, createVRMBot } from '@nexus/ai-bot';
 *
 *   <BotProvider wsUrl="/ws/bot" apiBase="/api/v1/bot" getToken={() => token}>
 *     <BotContainer plugin={createVRMBot('/model.vrm')} />
 *   </BotProvider>
 */

// ── Provider ──
export { BotProvider, useBotConfig } from './BotProvider';
export type { BotProviderConfig } from './BotProvider';

// ── Store ──
export { useBotStore } from './store';

// ── API ──
export { createBotApi } from './api';
export type { BotApi } from './api';

// ── Types (for custom plugin/voice development) ──
export type {
  BotPlugin,
  BotEmotion,
  BotAction,
  VoiceProvider,
  VoiceTTSOptions,
  VoiceConfig,
  SceneConfig,
  SceneStep,
  BotConfig,
} from './types';
