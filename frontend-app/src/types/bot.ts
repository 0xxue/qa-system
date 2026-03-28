/**
 * Bot Plugin Interface
 *
 * Any bot implementation (VRM 3D, 2D sprite, Lottie, etc.)
 * must implement this interface to be used with BotContainer.
 *
 * To create a custom bot:
 * 1. Implement BotPlugin interface
 * 2. Register it in BotContainer or via config
 */

export interface BotPlugin {
  /** Mount the bot into a DOM container */
  mount(container: HTMLElement): void;
  /** Unmount and clean up resources */
  unmount(): void;
  /** Set emotional state */
  setEmotion(state: BotEmotion): void;
  /** Start talking animation (mouth moves) */
  startTalking(): void;
  /** Stop talking animation */
  stopTalking(): void;
  /** Trigger a one-shot action (wave, nod, think) */
  triggerAction?(action: BotAction): void;
  /** Resize the renderer (e.g., when user changes bot size) */
  resize?(newSize: number): void;
}

export type BotEmotion = 'idle' | 'happy' | 'angry' | 'sad' | 'thinking' | 'talking' | 'surprised';
export type BotAction = 'wave' | 'nod' | 'think';

export interface BotConfig {
  enabled: boolean;
  /** Size in pixels */
  size: number;
  /** Initial position */
  position: { right: number; bottom: number };
  /** Bot plugin factory */
  createPlugin?: () => BotPlugin;
}

/**
 * Voice Provider Interface
 *
 * Pluggable STT (Speech-to-Text) + TTS (Text-to-Speech) system.
 * Implement this interface to add any voice provider.
 *
 * Built-in implementations:
 * - BrowserVoiceProvider — Web Speech API (free, zero config)
 * - APIVoiceProvider     — Backend proxy for Edge TTS / OpenAI (higher quality)
 */
export interface VoiceProvider {
  readonly name: string;

  /** Check if this provider is available in current environment */
  isAvailable(): boolean;

  // ── STT (Speech-to-Text) ──
  /** Start listening to microphone */
  startListening(options?: { lang?: string }): void;
  /** Stop listening, returns transcribed text */
  stopListening(): void;
  /** Callback when speech is recognized */
  onResult: ((text: string, isFinal: boolean) => void) | null;
  /** Callback when STT encounters an error */
  onError: ((error: string) => void) | null;

  // ── TTS (Text-to-Speech) ──
  /** Speak text aloud */
  speak(text: string, options?: VoiceTTSOptions): Promise<void>;
  /** Stop current speech */
  stopSpeaking(): void;
  /** Whether currently speaking */
  isSpeaking(): boolean;
  /** Callback when TTS starts/stops (for mouth sync) */
  onSpeakingChange: ((speaking: boolean) => void) | null;

  /** Cleanup resources */
  destroy(): void;
}

export interface VoiceTTSOptions {
  lang?: string;      // e.g. 'zh-CN', 'en-US'
  rate?: number;       // 0.5 - 2.0
  pitch?: number;      // 0 - 2
  voice?: string;      // Voice name / ID
}

export interface VoiceConfig {
  enabled: boolean;
  sttProvider: 'browser' | 'api';
  ttsProvider: 'browser' | 'edge' | 'openai';
  lang: string;
  rate: number;
  autoSpeak: boolean;  // Auto TTS on bot response
}
