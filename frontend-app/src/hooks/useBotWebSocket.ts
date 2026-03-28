/**
 * Bot WebSocket Hook
 *
 * Connects to the Bot WebSocket server for real-time communication.
 * Handles: chat, scene events, poke, emotion sync, reconnection.
 */

import { useEffect, useRef, useCallback } from 'react';
import { useBotStore } from '../store/bot';

export interface BotMessage {
  type: string;
  content?: string;
  emotion?: string;
  action?: string;
  scene?: string;
  tool_calls?: Array<{ tool: string; success: boolean }>;
  mode?: string;
  user?: { id: string; role: string; username: string };
}

export function useBotWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();
  const { setEmotion, plugin } = useBotStore();
  const messagesRef = useRef<BotMessage[]>([]);

  const getWsUrl = useCallback(() => {
    const token = localStorage.getItem('token') || '';
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname;
    // Use port 8000 (or 8001 for dev) for WebSocket
    const port = import.meta.env.DEV ? '8001' : '8000';
    return `${protocol}//${host}:${port}/ws/bot?token=${token}`;
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const url = getWsUrl();
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[Bot WS] Connected');
    };

    ws.onmessage = (event) => {
      try {
        const data: BotMessage = JSON.parse(event.data);
        messagesRef.current = [...messagesRef.current.slice(-50), data]; // Keep last 50

        // Handle different message types
        switch (data.type) {
          case 'connected':
            console.log('[Bot WS] Authenticated:', data.user?.username);
            break;

          case 'bot_message':
            // Show speech bubble
            if (data.content) {
              (window as any).__botSay?.(data.content, 5000);
            }
            // Set emotion
            if (data.emotion) {
              setEmotion(data.emotion as any);
              if (data.emotion === 'talking') plugin?.startTalking();
              else plugin?.stopTalking();
            }
            // Trigger action
            if (data.action) {
              plugin?.triggerAction?.(data.action as any);
            }
            // Auto reset to idle after 5s
            setTimeout(() => {
              setEmotion('idle');
              plugin?.stopTalking();
            }, 5000);
            break;

          case 'bot_emotion':
            if (data.emotion) {
              setEmotion(data.emotion as any);
              if (data.emotion === 'talking') plugin?.startTalking();
              else plugin?.stopTalking();
            }
            break;

          case 'bot_action':
            if (data.action) plugin?.triggerAction?.(data.action as any);
            break;

          case 'bot_alert':
            if (data.content) (window as any).__botSay?.(data.content, 8000);
            if (data.emotion) setEmotion(data.emotion as any);
            break;

          case 'pong':
            break;
        }

        // Notify chat panel subscribers
        _listeners.forEach(fn => fn(data));
      } catch {}
    };

    ws.onclose = () => {
      console.log('[Bot WS] Disconnected, reconnecting in 3s...');
      reconnectTimer.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [getWsUrl, setEmotion, plugin]);

  // Connect on mount
  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  // Send message
  const send = useCallback((data: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  // Convenience methods
  const sendChat = useCallback((message: string) => {
    send({ type: 'chat', message, page: window.location.pathname });
  }, [send]);

  const sendScene = useCallback((scene: string) => {
    send({ type: 'scene', scene });
  }, [send]);

  const sendPoke = useCallback(() => {
    send({ type: 'poke' });
  }, [send]);

  const sendModeChange = useCallback((mode: string) => {
    send({ type: 'mode_change', mode });
  }, [send]);

  return { send, sendChat, sendScene, sendPoke, sendModeChange, messages: messagesRef };
}

// Simple pub/sub for chat panel to listen to messages
type Listener = (msg: BotMessage) => void;
const _listeners: Set<Listener> = new Set();
export function onBotMessage(fn: Listener) { _listeners.add(fn); return () => _listeners.delete(fn); }
