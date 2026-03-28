import { useEffect, useRef, useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import type { BotEmotion } from '../../types/bot';
import { useBotStore } from '../../store/bot';
import { useBotWebSocket } from '../../hooks/useBotWebSocket';
import { botEngine } from '../../hooks/useBotEngine';
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

  // ── Fly To (smooth movement with transition) ──
  const isFlying = useRef(false);

  const flyTo = (x: number, y: number) => {
    setChatOpen(false);
    isFlying.current = true;
    setFloat({ x: 0, y: 0 }); // Freeze float animation during flight
    const s = window.innerWidth <= 768 ? 100 : size;
    const newPos = {
      x: Math.max(10, Math.min(window.innerWidth - s - 10, x - s / 2)),
      y: Math.max(10, Math.min(window.innerHeight - s - 10, y - s / 2)),
    };
    setPos(newPos);
    // Resume float after flight animation completes
    setTimeout(() => { isFlying.current = false; }, 800);
  };

  const getDefaultPos = () => {
    const s = window.innerWidth <= 768 ? 100 : size;
    return { x: window.innerWidth - s - 30, y: window.innerHeight - s - 70 };
  };

  // Store latest refs for engine to use (avoids stale closures)
  const flyToRef = useRef(flyTo);
  const setEmotionRef = useRef(setEmotion);
  const pluginRef = useRef(plugin);
  const sendChatRef = useRef(sendChat);
  flyToRef.current = flyTo;
  setEmotionRef.current = setEmotion;
  pluginRef.current = plugin;
  sendChatRef.current = sendChat;

  // ── Connect Bot Engine (once) ──
  useEffect(() => {
    botEngine.connect({
      moveTo: (x, y) => flyToRef.current(x, y),
      say: (text, duration) => (window as any).__botSay?.(text, duration || 3000),
      setEmotion: (e) => setEmotionRef.current(e),
      triggerAction: (a) => pluginRef.current?.triggerAction?.(a),
      sendChat: (m) => sendChatRef.current(m),
      getDefaultPos,
    });

    // Register built-in scenes
    botEngine.registerScene('page:chat', {
      moveTo: { x: '85vw', y: '75vh' },
      speech: "Let's chat! Ask me anything ▶",
      emotion: 'happy',
      action: 'wave',
    });
    botEngine.registerScene('page:kb', {
      moveTo: { x: '70vw', y: '30vh' },
      speech: 'Knowledge base! Upload your docs and I can answer questions about them 📚',
      emotion: 'happy',
    });
    botEngine.registerScene('page:settings', {
      moveTo: { x: '50vw', y: '35vh' },
      speech: 'Settings! You can change my personality, switch models, or resize me ⚙',
      emotion: 'idle',
    });
    botEngine.registerScene('welcome', {
      speech: '',  // Will be replaced by dynamic greeting
      emotion: 'happy',
      action: 'wave',
      delay: 1500,
    });

    // Dynamic scenes — fetch real data
    botEngine.on('welcome', async () => {
      try {
        const res = await fetch('/api/v1/stats');
        const stats = await res.json();
        const say = (window as any).__botSay;
        const setE = setEmotionRef.current;

        setE('happy');
        say?.(`Hey! I'm Clawford 🦀 Welcome back!`, 3000);
        await new Promise(r => setTimeout(r, 3500));

        if (stats.total_conversations > 0) {
          setE('talking');
          say?.(`You have ${stats.total_conversations} conversations and ${stats.total_messages} messages so far.`, 3500);
          await new Promise(r => setTimeout(r, 4000));
        }

        if (stats.total_documents > 0) {
          say?.(`${stats.total_documents} documents in your knowledge base. Ask me about them!`, 3000);
          await new Promise(r => setTimeout(r, 3500));
        }

        setE('idle');
        say?.('Click me to chat, or navigate around — I\'ll be right here! ◈', 4000);
      } catch {
        (window as any).__botSay?.('Hey! I\'m Clawford 🦀 Click me to chat!', 4000);
      }
    });

    // Dashboard: fly to each card with REAL numbers
    botEngine.on('page:dashboard', async () => {
      try {
        const res = await fetch('/api/v1/stats');
        const stats = await res.json();
        const say = (window as any).__botSay;
        const setE = setEmotionRef.current;
        const fly = flyToRef.current;

        setE('thinking');
        say?.('Dashboard! Let me check the numbers... 📊', 2500);
        await new Promise(r => setTimeout(r, 3000));

        // Fly to each stat card with real data
        const cards = document.querySelectorAll('.stat-cards > div');

        if (cards[0]) {
          const rect = cards[0].getBoundingClientRect();
          fly(rect.left + rect.width / 2, rect.top);
          await new Promise(r => setTimeout(r, 800));
          setE('talking');
          say?.(`${stats.total_users} users in the system 👥`, 2500);
          await new Promise(r => setTimeout(r, 3000));
        }

        if (cards[1]) {
          const rect = cards[1].getBoundingClientRect();
          fly(rect.left + rect.width / 2, rect.top);
          await new Promise(r => setTimeout(r, 800));
          say?.(`${stats.total_conversations} conversations so far 💬`, 2500);
          await new Promise(r => setTimeout(r, 3000));
        }

        if (cards[2]) {
          const rect = cards[2].getBoundingClientRect();
          fly(rect.left + rect.width / 2, rect.top);
          await new Promise(r => setTimeout(r, 800));
          say?.(`${stats.total_messages} messages exchanged 📨`, 2500);
          await new Promise(r => setTimeout(r, 3000));
        }

        if (cards[3]) {
          const rect = cards[3].getBoundingClientRect();
          fly(rect.left + rect.width / 2, rect.top);
          await new Promise(r => setTimeout(r, 800));
          say?.(`${stats.total_documents} documents in KB 📄`, 2500);
          await new Promise(r => setTimeout(r, 3000));
        }

        // Fly to chart
        const chart = document.querySelector('.charts-grid > div');
        if (chart) {
          const rect = chart.getBoundingClientRect();
          fly(rect.left + rect.width / 2, rect.top);
          await new Promise(r => setTimeout(r, 800));
          setE('happy');
          say?.('Trends looking good! Everything is healthy ✅', 3000);
          await new Promise(r => setTimeout(r, 3500));
        }

        // Return to default
        const def = getDefaultPos();
        fly(def.x + 90, def.y + 90);
        setE('happy');
        say?.('Data briefing complete! Need deeper analysis? Just ask 🦀', 4000);
        await new Promise(r => setTimeout(r, 4500));
        setE('idle');
      } catch {
        (window as any).__botSay?.('Dashboard loaded! Click me for details 📊', 3000);
      }
    });
  }, []); // Run once — refs keep handlers fresh

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

  // ── Welcome (after everything is ready) ──
  const hasWelcomed = useRef(false);
  useEffect(() => {
    if (!hasWelcomed.current && plugin) {
      hasWelcomed.current = true;
      // Delay to ensure __botSay is registered
      setTimeout(() => botEngine.emit('welcome'), 2000);
    }
  }, [plugin]);

  // ── Scene Detection (page change) ──
  const prevPath = useRef(location.pathname);
  useEffect(() => {
    if (location.pathname !== prevPath.current) {
      prevPath.current = location.pathname;
      const sceneMap: Record<string, string> = {
        '/chat': 'page:chat', '/kb': 'page:kb', '/dashboard': 'page:dashboard',
        '/settings': 'page:settings', '/admin': 'page:settings',
      };
      const scene = sceneMap[location.pathname];
      if (scene) {
        botEngine.emit(scene);
        sendScene(scene);
      }
    }
  }, [location.pathname, sendScene]);

  // ── Idle Behavior (every 15s — uses refs to avoid stale closures) ──
  const chatOpenRef = useRef(chatOpen);
  const draggingRef = useRef(dragging);
  chatOpenRef.current = chatOpen;
  draggingRef.current = dragging;

  useEffect(() => {
    let count = 0;
    const interval = setInterval(() => {
      if (draggingRef.current || chatOpenRef.current || isFlying.current) return;
      count++;

      const say = (window as any).__botSay;
      const p = pluginRef.current;
      const setE = setEmotionRef.current;

      if (count % 3 === 0) {
        // Every 45s: say something with data
        fetch('/api/v1/stats').then(r => r.json()).then(stats => {
          const dataLines = [
            `System running with ${stats.total_users} users ✓`,
            `${stats.total_conversations} conversations happening 💬`,
            `${stats.total_messages} messages and counting 📨`,
            `${stats.total_documents} docs in knowledge base 📄`,
          ];
          say?.(dataLines[Math.floor(Math.random() * dataLines.length)], 4000);
          setE('talking');
          setTimeout(() => setE('idle'), 4000);
        }).catch(() => {});
      } else if (count % 2 === 0) {
        // Every 30s: personality phrase
        const phrases = [
          'Standing by~ ✦', 'Need help?', 'Click me to chat! 💬',
          'All systems running smooth ✓', 'I can check data for you 📊',
          'Try asking me to create a knowledge base!',
          'I\'m Clawford 🦀', 'Ask me anything!',
        ];
        say?.(phrases[Math.floor(Math.random() * phrases.length)], 3000);
      } else {
        // Every 15s: random gesture
        const gestures = [
          () => { setE('happy'); p?.triggerAction?.('wave'); setTimeout(() => setE('idle'), 2000); },
          () => { setE('thinking'); p?.triggerAction?.('think'); setTimeout(() => setE('idle'), 3000); },
          () => { p?.triggerAction?.('nod'); },
          () => { say?.('🦀', 1500); },
        ];
        gestures[Math.floor(Math.random() * gestures.length)]();
      }
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  // ── Click Handler: single = toggle chat, double = poke ──
  const wasDragging = useRef(false);
  const handleClick = useCallback((e: React.MouseEvent) => {
    // Ignore if was dragging
    if (wasDragging.current) { wasDragging.current = false; return; }
    if (Math.abs(e.movementX) + Math.abs(e.movementY) > 3) return;

    clickCount.current++;
    if (clickTimer.current) clearTimeout(clickTimer.current);

    clickTimer.current = setTimeout(() => {
      if (clickCount.current >= 2) {
        // Double click → poke (touch)
        sendPoke();
        setEmotion('surprised');
        setTimeout(() => setEmotion('idle'), 1500);
      } else {
        // Single click → toggle chat panel
        setChatOpen(prev => !prev);
      }
      clickCount.current = 0;
    }, 250);
  }, [sendPoke, setEmotion]);

  // ── Drag (only starts after moving 5px threshold) ──
  const dragStartPos = useRef({ x: 0, y: 0 });
  const isDragStarted = useRef(false);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    isDragStarted.current = false;
    wasDragging.current = false;
    const rect = (e.target as HTMLElement).closest('[data-bot-container]')!.getBoundingClientRect();
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };

    const onMove = (ev: MouseEvent) => {
      const dx = Math.abs(ev.clientX - dragStartPos.current.x);
      const dy = Math.abs(ev.clientY - dragStartPos.current.y);

      // Only start drag after 5px movement
      if (!isDragStarted.current && dx + dy > 5) {
        isDragStarted.current = true;
        wasDragging.current = true;
        setDragging(true);
        setChatOpen(false);
        setEmotion('surprised');
      }

      if (isDragStarted.current) {
        setPos({
          x: Math.max(10, Math.min(window.innerWidth - size - 10, ev.clientX - dragOffset.current.x)),
          y: Math.max(10, Math.min(window.innerHeight - size - 10, ev.clientY - dragOffset.current.y)),
        });
      }
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (isDragStarted.current) {
        setDragging(false);
        setEmotion('idle');
        (window as any).__botSay?.('Put me down~ ✦', 2000);
      }
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    e.preventDefault();
  }, [size, setEmotion]);

  // ── Float Animation (pauses during drag and flight) ──
  const floatPhase = useRef(0);
  const [float, setFloat] = useState({ x: 0, y: 0 });
  useEffect(() => {
    if (dragging) return;
    let raf: number;
    const loop = () => {
      if (!isFlying.current) {
        floatPhase.current += 0.008;
        setFloat({ x: Math.sin(floatPhase.current) * 4, y: Math.cos(floatPhase.current * 1.3) * 5 });
      }
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
        botPos={pos}
        botSize={getMobileSize()}
      />
    </>
  );
}
