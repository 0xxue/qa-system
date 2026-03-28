/**
 * Bot Chat Panel — Mini dialog that opens when clicking the bot.
 *
 * Features:
 * - WebSocket-connected (real-time, bidirectional)
 * - Shows bot messages with emotions
 * - Tool call indicators
 * - Input field for user messages
 * - Minimizable/closable
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { onBotMessage, type BotMessage } from '../../hooks/useBotWebSocket';
import { X, Minus, Send } from 'lucide-react';

interface ChatMessage {
  id: string;
  role: 'user' | 'bot';
  content: string;
  emotion?: string;
  tools?: Array<{ tool: string; success: boolean }>;
  timestamp: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSend: (message: string) => void;
}

export function BotChatPanel({ open, onClose, onSend }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 'welcome', role: 'bot', content: "Hi! I'm Nexus Bot. Ask me anything or tell me to do something!", timestamp: Date.now() },
  ]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Listen for bot messages from WebSocket
  useEffect(() => {
    return onBotMessage((msg: BotMessage) => {
      if (msg.type === 'bot_message' || msg.type === 'bot_alert') {
        if (msg.content) {
          setMessages(prev => [...prev, {
            id: `bot-${Date.now()}`,
            role: 'bot',
            content: msg.content!,
            emotion: msg.emotion,
            tools: msg.tool_calls,
            timestamp: Date.now(),
          }]);
          setThinking(false);
        }
      }
      if (msg.type === 'bot_emotion' && msg.emotion === 'thinking') {
        setThinking(true);
      }
    });
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, thinking]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    setMessages(prev => [...prev, { id: `user-${Date.now()}`, role: 'user', content: text, timestamp: Date.now() }]);
    setInput('');
    onSend(text);
  }, [input, onSend]);

  if (!open) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 80, right: 20, zIndex: 1002,
      width: 340, height: 420, display: 'flex', flexDirection: 'column',
      border: '2px solid var(--ink)', background: 'var(--cream)',
      boxShadow: '6px 6px 0 var(--orange)',
      animation: 'cardIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
    }}>
      {/* Header */}
      <div style={{
        padding: '8px 12px', borderBottom: '2px solid var(--ink)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'var(--paper)',
      }}>
        <span className="font-display" style={{ fontSize: 14, letterSpacing: 2 }}>
          NEXUS BOT
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            <X size={14} color="var(--mid)" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {messages.map(m => (
          <div key={m.id} style={{
            display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
          }}>
            <div style={{
              maxWidth: '80%', padding: '8px 12px', fontSize: 12, lineHeight: 1.5,
              border: `1.5px solid ${m.role === 'user' ? 'var(--ink)' : 'var(--orange)'}`,
              background: m.role === 'user' ? 'var(--ink)' : 'rgba(212, 82, 26, 0.04)',
              color: m.role === 'user' ? 'var(--cream)' : 'var(--ink)',
              wordBreak: 'break-word',
            }}>
              {m.content}
              {m.tools && m.tools.length > 0 && (
                <div className="font-mono" style={{ fontSize: 9, color: 'var(--dim)', marginTop: 4, borderTop: '1px solid var(--line)', paddingTop: 4 }}>
                  {m.tools.map((t, i) => (
                    <span key={i}>{t.success ? '✓' : '✗'} {t.tool}{i < m.tools!.length - 1 ? ' → ' : ''}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Thinking indicator */}
        {thinking && (
          <div style={{ display: 'flex', gap: 5, padding: 8 }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{
                width: 6, height: 6, background: 'var(--orange)',
                animation: `dotBounce 1.2s ease-in-out infinite ${i * 0.2}s`,
              }} />
            ))}
          </div>
        )}
      </div>

      {/* Input */}
      <div style={{
        padding: '8px 10px', borderTop: '2px solid var(--ink)',
        display: 'flex', gap: 6,
      }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSend(); }}
          placeholder="Ask bot or give commands..."
          className="font-mono"
          style={{
            flex: 1, background: 'none', border: '1.5px solid var(--line)',
            outline: 'none', padding: '6px 10px', fontSize: 12, color: 'var(--ink)',
          }}
          onFocus={e => e.target.style.borderColor = 'var(--orange)'}
          onBlur={e => e.target.style.borderColor = 'var(--line)'}
        />
        <button onClick={handleSend} style={{
          width: 32, height: 32, border: 'none', background: 'var(--orange)',
          color: 'var(--cream)', cursor: 'pointer', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}
