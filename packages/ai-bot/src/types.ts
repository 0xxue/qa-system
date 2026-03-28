/**
 * @nexus/ai-bot — Type definitions
 *
 * All public interfaces for building custom plugins, voice providers, etc.
 */

// ══════════════════════════════════════
// Bot Plugin (3D/2D Avatar)
// ══════════════════════════════════════

export interface BotPlugin {
  mount(container: HTMLElement): void;
  unmount(): void;
  setEmotion(state: BotEmotion): void;
  startTalking(): void;
  stopTalking(): void;
  triggerAction?(action: BotAction): void;
  resize?(newSize: number): void;
}

export type BotEmotion = 'idle' | 'happy' | 'angry' | 'sad' | 'thinking' | 'talking' | 'surprised';
export type BotAction = 'wave' | 'nod' | 'think';

// ══════════════════════════════════════
// Voice Provider (STT + TTS)
// ══════════════════════════════════════

export interface VoiceProvider {
  readonly name: string;
  isAvailable(): boolean;

  // STT
  startListening(options?: { lang?: string }): void;
  stopListening(): void;
  onResult: ((text: string, isFinal: boolean) => void) | null;
  onError: ((error: string) => void) | null;

  // TTS
  speak(text: string, options?: VoiceTTSOptions): Promise<void>;
  stopSpeaking(): void;
  isSpeaking(): boolean;
  onSpeakingChange: ((speaking: boolean) => void) | null;

  destroy(): void;
}

export interface VoiceTTSOptions {
  lang?: string;
  rate?: number;
  pitch?: number;
  voice?: string;
}

export interface VoiceConfig {
  enabled: boolean;
  sttProvider: 'browser' | 'api';
  ttsProvider: 'browser' | 'edge' | 'openai';
  lang: string;
  rate: number;
  autoSpeak: boolean;
}

// ══════════════════════════════════════
// Bot Engine (Scene System)
// ══════════════════════════════════════

export interface SceneConfig {
  moveTo?: { x: number | string; y: number | string };
  speech?: string;
  emotion?: BotEmotion;
  action?: BotAction;
  autoFetch?: string;
  delay?: number;
  steps?: SceneStep[];
}

export interface SceneStep {
  elementId?: string;
  moveTo?: { x: number | string; y: number | string };
  speech: string;
  emotion?: BotEmotion;
  action?: BotAction;
  duration?: number;
}

// ══════════════════════════════════════
// Configuration
// ══════════════════════════════════════

export interface BotConfig {
  enabled?: boolean;
  size?: number;
  position?: { x: number; y: number };
  wsUrl?: string;
  apiBase?: string;
  getToken?: () => string | null | undefined;
}
