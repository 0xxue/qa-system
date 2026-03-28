import { useEffect, useRef, useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useBotStore } from '../../store/bot';
import { useBotWebSocket } from '../../hooks/useBotWebSocket';
import { BotChatPanel } from './BotChatPanel';

/**
 * BotContainer — Floating draggable 3D bot with WebSocket, chat panel, and scene awareness.
 *
 * Features:
 * - Draggable with float animation
 * - Click to open chat panel (double-click or single click)
 * - Scene detection (page navigation → bot reaction)
 * - Poke response (click while chat is closed)
 * - Idle random phrases
 * - Speech bubbles following bot position
 * - WebSocket connected to Bot Brain
 */

export function BotContainer() {
  const { enabled, plugin, size, emotion, setEmotion } = useBotStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const { sendChat, sendScene, sendPoke } = useBotWebSocket();
  const location = useLocation();

  // ── Size & Position ──
  const getMobileSize = () => window.innerWidth <= 768 ? 100 : size;
  const [pos, setPos] = useState(() => {
    const s = getMobileSize();
    return { x: window.innerWidth - s - 30, y: window.innerHeight - s - (window.innerWidth <= 768 ? 80 : 70) };
  });

  useEffect(() => {
    const onResize = () => {
      const s = getMobileSize();
      setPos({ x: window.innerWidth - s - 30, y: window.innerHeight - s - (window.innerWidth <= 768 ? 80 : 70) });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [size]);

  // ── State ──
  const [dragging, setDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const [speechText, setSpeechText] = useState('');
  const speechTimer = useRef<ReturnType<typeof setTimeout>>();
  const [chatOpen, setChatOpen] = useState(false);
  const clickCount = useRef(0);
  const clickTimer = useRef<ReturnType<typeof setTimeout>>();

  // ── Mount Plugin ──
  useEffect(() => {
    if (!plugin || !containerRef.current || !enabled) return;
    plugin.mount(containerRef.current);
    return () => plugin.unmount();
  }, [plugin, enabled]);

  // ── Sync Emotion ──
  useEffect(() => {
    if (!plugin) return;
    plugin.setEmotion(emotion);
    if (emotion === 'talking') plugin.startTalking();
    else plugin.stopTalking();
  }, [plugin, emotion]);

  // ── Speech Bubble ──
  useEffect(() => {
    (window as any).__botSay = (text: string, duration = 3000) => {
      setSpeechText(text);
      if (speechTimer.current) clearTimeout(speechTimer.current);
      speechTimer.current = setTimeout(() => setSpeechText(''), duration);
    };
    return () => { delete (window as any).__botSay; };
  }, []);

  // ── Scene Detection (page change → send scene event) ──
  const prevPath = useRef(location.pathname);
  useEffect(() => {
    if (location.pathname !== prevPath.current) {
      prevPath.current = location.pathname;
      const sceneMap: Record<string, string> = {
        '/chat': 'page:chat',
        '/kb': 'page:kb',
        '/dashboard': 'page:dashboard',
        '/settings': 'page:settings',
      };
      const scene = sceneMap[location.pathname];
      if (scene) sendScene(scene);
    }
  }, [location.pathname, sendScene]);

  // ── Idle Phrases (every 45s in companion mode) ──
  useEffect(() => {
    const interval = setInterval(() => {
      if (!dragging && !chatOpen && emotion === 'idle') {
        const phrases = ['Standing by~ ✦', 'Need help?', 'Ask me anything! 💬', 'All systems normal ✓', 'Click me to chat!'];
        (window as any).__botSay?.(phrases[Math.floor(Math.random() * phrases.length)], 3000);
      }
    }, 45000);
    return () => clearInterval(interval);
  }, [dragging, chatOpen, emotion]);

  // ── Click Handler (single = poke, double = open chat) ──
  const handleClick = useCallback((e: React.MouseEvent) => {
    if (dragging) return;
    if (Math.abs(e.movementX) + Math.abs(e.movementY) > 3) return;

    clickCount.current++;
    if (clickTimer.current) clearTimeout(clickTimer.current);

    clickTimer.current = setTimeout(() => {
      if (clickCount.current >= 2) {
        // Double click → toggle chat panel
        setChatOpen(prev => !prev);
      } else {
        // Single click → poke or toggle chat
        if (chatOpen) {
          // Already open, just poke
          sendPoke();
          setEmotion('surprised');
          setTimeout(() => setEmotion('idle'), 1500);
        } else {
          // Open chat
          setChatOpen(true);
        }
      }
      clickCount.current = 0;
    }, 250);
  }, [dragging, chatOpen, sendPoke, setEmotion]);

  // ── Drag ──
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setDragging(true);
    const rect = (e.target as HTMLElement).closest('[data-bot-container]')!.getBoundingClientRect();
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    e.preventDefault();
  }, []);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      setPos({
        x: Math.max(10, Math.min(window.innerWidth - size - 10, e.clientX - dragOffset.current.x)),
        y: Math.max(10, Math.min(window.innerHeight - size - 10, e.clientY - dragOffset.current.y)),
      });
    };
    const onUp = () => {
      setDragging(false);
      setEmotion('idle');
      (window as any).__botSay?.('Put me down~ ✦', 2000);
    };
    setEmotion('surprised');
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [dragging, size, setEmotion]);

  // ── Float Animation ──
  const floatPhase = useRef(0);
  const [float, setFloat] = useState({ x: 0, y: 0 });
  useEffect(() => {
    if (dragging) return;
    let raf: number;
    const loop = () => {
      floatPhase.current += 0.008;
      setFloat({ x: Math.sin(floatPhase.current) * 4, y: Math.cos(floatPhase.current * 1.3) * 5 });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [dragging]);

  if (!enabled) return null;

  return (
    <>
      {/* Speech bubble */}
      {speechText && (
        <div className="font-mono" style={{
          position: 'fixed',
          left: Math.max(10, pos.x - 130),
          top: Math.max(10, pos.y - 50),
          zIndex: 1001,
          maxWidth: 220,
          padding: '8px 14px',
          border: '2px solid var(--ink)',
          background: 'var(--cream)',
          boxShadow: '4px 4px 0 var(--orange)',
          fontSize: 12,
          color: 'var(--ink)',
          animation: 'cardIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)',
          pointerEvents: 'none',
        }}>
          {speechText}
        </div>
      )}

      {/* Bot avatar */}
      <div
        data-bot-container
        onMouseDown={onMouseDown}
        onClick={handleClick}
        style={{
          position: 'fixed',
          left: pos.x + (dragging ? 0 : float.x),
          top: pos.y + (dragging ? 0 : float.y),
          width: getMobileSize(),
          height: getMobileSize(),
          zIndex: 1000,
          cursor: dragging ? 'grabbing' : 'pointer',
          userSelect: 'none',
          transition: dragging ? 'none' : 'left 0.7s cubic-bezier(0.34,1.2,0.64,1), top 0.7s cubic-bezier(0.34,1.2,0.64,1)',
          filter: `drop-shadow(0 0 20px rgba(212, 82, 26, ${dragging ? 0.5 : 0.25}))`,
          transform: `scale(${size / getMobileSize()})${dragging ? ' scale(1.08)' : ''}`,
          transformOrigin: 'center center',
          overflow: 'visible',
        }}
      >
        <div ref={containerRef} style={{ width: '100%', height: '100%', cursor: 'inherit' }} />
      </div>

      {/* Chat panel */}
      <BotChatPanel
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        onSend={sendChat}
      />
    </>
  );
}
