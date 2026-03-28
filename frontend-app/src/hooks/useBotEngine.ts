/**
 * Bot Engine — Event-driven behavior system
 *
 * Decoupled from page structure. Host app emits events,
 * Bot Engine decides how to react (move, speak, emote, fetch data).
 *
 * Usage (host app):
 *   botEngine.emit('page:dashboard');
 *   botEngine.emit('element:hover', { id: 'stat-card-1', rect: el.getBoundingClientRect() });
 *
 * Usage (standalone):
 *   import { botEngine } from '@nexus/ai-bot';
 *   botEngine.registerScene('page:dashboard', { ... });
 */

import type { BotEmotion, BotAction } from '../types/bot';

export interface SceneConfig {
  moveTo?: { x: number | string; y: number | string };
  speech?: string;
  emotion?: BotEmotion;
  action?: BotAction;
  autoFetch?: string;  // Tool to call automatically
  delay?: number;      // Delay before reaction (ms)
  steps?: SceneStep[]; // Multi-step tour
}

export interface SceneStep {
  elementId?: string;   // DOM element to fly to
  moveTo?: { x: number | string; y: number | string };
  speech: string;
  emotion?: BotEmotion;
  action?: BotAction;
  duration?: number;    // How long to stay (ms)
}

type EventHandler = (data?: any) => void;

class BotEngine {
  private scenes: Map<string, SceneConfig> = new Map();
  private listeners: Map<string, Set<EventHandler>> = new Map();
  private _moveTo: ((x: number, y: number) => void) | null = null;
  private _say: ((text: string, duration?: number) => void) | null = null;
  private _setEmotion: ((e: BotEmotion) => void) | null = null;
  private _triggerAction: ((a: BotAction) => void) | null = null;
  private _sendChat: ((msg: string) => void) | null = null;
  private _getDefaultPos: (() => { x: number; y: number }) | null = null;
  private touring = false;

  /**
   * Connect Bot Engine to the BotContainer renderer.
   * Called once when BotContainer mounts.
   */
  connect(handlers: {
    moveTo: (x: number, y: number) => void;
    say: (text: string, duration?: number) => void;
    setEmotion: (e: BotEmotion) => void;
    triggerAction: (a: BotAction) => void;
    sendChat: (msg: string) => void;
    getDefaultPos: () => { x: number; y: number };
  }) {
    this._moveTo = handlers.moveTo;
    this._say = handlers.say;
    this._setEmotion = handlers.setEmotion;
    this._triggerAction = handlers.triggerAction;
    this._sendChat = handlers.sendChat;
    this._getDefaultPos = handlers.getDefaultPos;
  }

  /**
   * Register a scene configuration.
   */
  registerScene(event: string, config: SceneConfig) {
    this.scenes.set(event, config);
  }

  /**
   * Emit an event. Bot reacts based on registered scenes.
   */
  emit(event: string, data?: any) {
    const scene = this.scenes.get(event);
    if (scene) {
      this.executeScene(scene, data);
    }
    // Also notify custom listeners
    this.listeners.get(event)?.forEach(fn => fn(data));
  }

  /**
   * Listen for events (for custom integrations).
   */
  on(event: string, handler: EventHandler) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(handler);
    return () => this.listeners.get(event)?.delete(handler);
  }

  /**
   * Execute a scene: move + speak + emote + auto-fetch.
   */
  private async executeScene(scene: SceneConfig, data?: any) {
    if (this.touring) return;

    // Multi-step tour
    if (scene.steps?.length) {
      await this.executeTour(scene.steps);
      return;
    }

    const delay = scene.delay || 0;
    if (delay) await this.sleep(delay);

    // Move
    if (scene.moveTo) {
      const pos = this.resolvePosition(scene.moveTo, data);
      this._moveTo?.(pos.x, pos.y);
    }

    // Emotion
    if (scene.emotion) {
      this._setEmotion?.(scene.emotion);
    }

    // Speech (with template variables)
    if (scene.speech) {
      const text = this.interpolate(scene.speech, data);
      setTimeout(() => this._say?.(text, 4000), 300);
    }

    // Action
    if (scene.action) {
      setTimeout(() => this._triggerAction?.(scene.action!), 500);
    }

    // Auto-fetch tool
    if (scene.autoFetch) {
      setTimeout(() => this._sendChat?.(`[auto] ${scene.autoFetch}`), 1000);
    }

    // Reset to idle after speech
    if (scene.emotion && scene.emotion !== 'idle') {
      setTimeout(() => this._setEmotion?.('idle'), 5000);
    }
  }

  /**
   * Execute a multi-step tour (Bot flies to each element).
   */
  async executeTour(steps: SceneStep[]) {
    if (this.touring) return;
    this.touring = true;

    for (const step of steps) {
      // Find target position
      let targetPos: { x: number; y: number } | null = null;

      if (step.elementId) {
        const el = document.getElementById(step.elementId) || document.querySelector(step.elementId);
        if (el) {
          const rect = el.getBoundingClientRect();
          targetPos = { x: rect.left + rect.width / 2, y: rect.top - 60 };
        }
      }

      if (!targetPos && step.moveTo) {
        targetPos = this.resolvePosition(step.moveTo);
      }

      if (targetPos) {
        this._setEmotion?.('thinking');
        this._moveTo?.(targetPos.x, targetPos.y);
        await this.sleep(600); // Wait for fly animation
      }

      // Speak + emote
      this._setEmotion?.(step.emotion || 'talking');
      this._say?.(step.speech, step.duration || 3000);

      if (step.action) {
        this._triggerAction?.(step.action);
      }

      await this.sleep((step.duration || 3000) + 500);
    }

    // Return to default position
    const defaultPos = this._getDefaultPos?.();
    if (defaultPos) {
      this._moveTo?.(defaultPos.x, defaultPos.y);
    }
    this._setEmotion?.('idle');
    this.touring = false;
  }

  /**
   * Resolve position from string/number values.
   */
  private resolvePosition(pos: { x: number | string; y: number | string }, data?: any): { x: number; y: number } {
    const resolve = (v: number | string): number => {
      if (typeof v === 'number') return v;
      if (v.endsWith('vw')) return (parseFloat(v) / 100) * window.innerWidth;
      if (v.endsWith('vh')) return (parseFloat(v) / 100) * window.innerHeight;
      return parseFloat(v) || 0;
    };

    // If data has a rect (element position), use it
    if (data?.rect) {
      return { x: data.rect.left + (data.rect.width || 0) / 2, y: data.rect.top - 60 };
    }

    return { x: resolve(pos.x), y: resolve(pos.y) };
  }

  private interpolate(template: string, data?: any): string {
    if (!data) return template;
    return template.replace(/\{(\w+)\}/g, (_, key) => data[key] ?? `{${key}}`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton
export const botEngine = new BotEngine();

// Expose globally for any script to use
(window as any).botEngine = botEngine;
