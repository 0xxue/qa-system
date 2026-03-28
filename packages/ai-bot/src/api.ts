/**
 * Bot API client — All HTTP calls go through here.
 * Uses BotProvider config for base URL and auth.
 */

import type { BotProviderConfig } from './BotProvider';

export function createBotApi(config: BotProviderConfig) {
  const headers = (): Record<string, string> => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = config.getToken();
    if (token) h['Authorization'] = `Bearer ${token}`;
    return h;
  };

  return {
    // Messages
    async getMessages(limit = 20): Promise<any[]> {
      const r = await fetch(`${config.apiBase}/messages?limit=${limit}`, { headers: headers() });
      return r.ok ? r.json() : [];
    },

    // Preferences
    async getPreferences(): Promise<any> {
      const r = await fetch(`${config.apiBase}/preferences`, { headers: headers() });
      return r.ok ? r.json() : null;
    },
    async savePreferences(data: Record<string, any>): Promise<void> {
      await fetch(`${config.apiBase}/preferences`, { method: 'PUT', headers: headers(), body: JSON.stringify(data) }).catch(() => {});
    },

    // Scenes
    async getScenes(): Promise<any[]> {
      const r = await fetch(`${config.apiBase}/scenes`, { headers: headers() });
      return r.ok ? r.json() : [];
    },
    async updateScene(key: string, data: Record<string, any>): Promise<any> {
      const r = await fetch(`${config.apiBase}/scenes/${key}`, { method: 'PUT', headers: headers(), body: JSON.stringify(data) });
      return r.json();
    },

    // Stats
    async getStats(): Promise<any> {
      const r = await fetch(`${config.apiBase}/stats`, { headers: headers() });
      return r.ok ? r.json() : {};
    },

    // TTS
    async tts(text: string, provider = 'edge', lang = 'zh-CN', rate = 1.0, voice?: string): Promise<ArrayBuffer | null> {
      const r = await fetch(`${config.apiBase}/tts`, {
        method: 'POST', headers: headers(),
        body: JSON.stringify({ text, provider, lang, rate, voice }),
      });
      return r.ok ? r.arrayBuffer() : null;
    },

    // TTS voices
    async getTTSVoices(provider = 'edge', lang = 'zh-CN'): Promise<any[]> {
      const r = await fetch(`${config.apiBase}/tts/voices?provider=${provider}&lang=${lang}`, { headers: headers() });
      return r.ok ? r.json() : [];
    },

    // Cleanup
    async cleanup(): Promise<any> {
      const r = await fetch(`${config.apiBase}/cleanup`, { method: 'POST', headers: headers() });
      return r.json();
    },

    // Conversation summary (from QA API)
    async getConversationSummary(convId: number): Promise<string> {
      const base = config.qaApiBase || '/api/v1/qa';
      const r = await fetch(`${base}/conversations/${convId}/summary`, { headers: headers() });
      if (!r.ok) return '';
      const data = await r.json();
      return data.summary || '';
    },
  };
}

export type BotApi = ReturnType<typeof createBotApi>;
