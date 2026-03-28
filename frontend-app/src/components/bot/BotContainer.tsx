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

  const posOverridden = useRef(false); // true = user dragged or loaded from DB, don't reset on resize

  useEffect(() => {
    const onResize = () => {
      if (posOverridden.current) return; // Don't reset user's custom position
      const s = window.innerWidth <= 768 ? 100 : size;
      setPos({ x: window.innerWidth - s - 30, y: window.innerHeight - s - (window.innerWidth <= 768 ? 80 : 70) });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [size]);

  // ── Load persisted preferences on mount ──
  const prefsLoaded = useRef(false);
  const [ready, setReady] = useState(false); // Hide bot until prefs loaded (prevents position flash)
  useEffect(() => {
    if (prefsLoaded.current) return;
    prefsLoaded.current = true;
    const token = localStorage.getItem('token');
    if (!token && !localStorage.getItem('demo_mode')) {
      setReady(true);
      return;
    }
    fetch('/api/v1/bot/preferences', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.json())
      .then((prefs: any) => {
        if (prefs.position_x != null && prefs.position_y != null) {
          setPos({ x: prefs.position_x, y: prefs.position_y });
          posOverridden.current = true;
        }
        if (prefs.bot_size && prefs.bot_size !== useBotStore.getState().size) {
          useBotStore.getState().setSize(prefs.bot_size);
        }
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  // ── Save position on change (debounced) ──
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const savePrefs = useCallback((data: Record<string, any>) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const token = localStorage.getItem('token');
      if (!token) return;
      fetch('/api/v1/bot/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(data),
      }).catch(() => {});
    }, 1000);
  }, []);

  // ── State ──
  const [dragging, setDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const [speechText, setSpeechText] = useState('');
  const speechTimer = useRef<ReturnType<typeof setTimeout>>();
  const [chatOpen, setChatOpen] = useState(false);
  const clickCount = useRef(0);
  const clickTimer = useRef<ReturnType<typeof setTimeout>>();

  // ── Trail Particles ──
  const emitTrail = useCallback((cx: number, cy: number) => {
    const count = 5 + Math.floor(Math.random() * 6);
    const colors = ['#d4521a', '#e8652a', '#f0e8d8', '#ddd0b8', '#c8420a', '#ff6b35'];
    for (let i = 0; i < count; i++) {
      const p = document.createElement('div');
      const sz = 4 + Math.random() * 8;
      const spread = 40;
      const glow = colors[Math.floor(Math.random() * colors.length)];
      p.style.cssText = `position:fixed;width:${sz}px;height:${sz}px;left:${cx + (Math.random() - 0.5) * spread}px;top:${cy + (Math.random() - 0.5) * spread}px;background:${glow};box-shadow:0 0 ${sz}px ${glow};border-radius:${Math.random() > 0.5 ? '50%' : '0'};pointer-events:none;z-index:998;opacity:0.9;transition:all ${0.6 + Math.random() * 0.5}s ease-out;`;
      document.body.appendChild(p);
      requestAnimationFrame(() => {
        p.style.opacity = '0';
        p.style.transform = `translateY(-${15 + Math.random() * 25}px) scale(0.1) rotate(${Math.random() * 180}deg)`;
      });
      setTimeout(() => p.remove(), 1100);
    }
  }, []);

  // ── Beacon (target pulse) ──
  const [beacon, setBeacon] = useState<{ x: number; y: number; show: boolean }>({ x: 0, y: 0, show: false });

  // ── Fly To (with trail + beacon) ──
  const isFlying = useRef(false);
  const trailInterval = useRef<ReturnType<typeof setInterval>>();

  const flyTo = (x: number, y: number) => {
    setChatOpen(false);
    isFlying.current = true;
    setFloat({ x: 0, y: 0 });
    const s = window.innerWidth <= 768 ? 100 : size;
    const newPos = {
      x: Math.max(10, Math.min(window.innerWidth - s - 10, x - s / 2)),
      y: Math.max(10, Math.min(window.innerHeight - s - 10, y - s / 2)),
    };

    // Show beacon at target
    setBeacon({ x: newPos.x + s / 2, y: newPos.y + s / 2, show: true });

    // Emit trail particles during flight
    if (trailInterval.current) clearInterval(trailInterval.current);
    trailInterval.current = setInterval(() => {
      const el = document.querySelector('[data-bot-container]');
      if (el) {
        const r = el.getBoundingClientRect();
        emitTrail(r.left + r.width / 2, r.top + r.height / 2);
      }
    }, 80);

    setPos(newPos);

    // Cleanup after flight
    setTimeout(() => {
      isFlying.current = false;
      setBeacon(b => ({ ...b, show: false }));
      if (trailInterval.current) clearInterval(trailInterval.current);
    }, 800);
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
    // Feature Tour (first-time only)
    botEngine.registerScene('feature_tour', {
      steps: [
        { elementId: '.sidebar-desktop', speech: 'This is the navigation! Switch between Chat, KB, Dashboard and more ▶', emotion: 'talking', duration: 3000 },
        { elementId: '.hist-rail', speech: 'Your conversation history appears here ◈', emotion: 'talking', duration: 2500 },
        { elementId: '.chat-input-zone', speech: 'Type your question here and press Enter ▶', emotion: 'talking', duration: 2500 },
        { speech: 'Tour complete! Click me anytime to chat. Welcome aboard! 🦀', emotion: 'happy', duration: 3000 },
      ],
    });

    // Auto-trigger tour on first visit
    botEngine.on('welcome', () => {
      if (!localStorage.getItem('bot_tour_done')) {
        setTimeout(() => {
          botEngine.emit('feature_tour');
          localStorage.setItem('bot_tour_done', '1');
        }, 8000); // After welcome greeting
      }
    });

    // Chat: summarize conversation when user clicks history
    botEngine.on('chat:load_conversation', async (data: any) => {
      if (!data) return;
      const say = (window as any).__botSay;
      const setE = setEmotionRef.current;
      const fly = flyToRef.current;

      // Fly to the clicked conversation item
      if (data.rect) {
        fly(data.rect.right + 40, data.rect.top + data.rect.height / 2);
      }
      await new Promise(r => setTimeout(r, 600));

      setE('thinking');
      say?.(`Loading "${data.title || 'conversation'}"...`, 2000);
      await new Promise(r => setTimeout(r, 1500));

      // Fetch summary from backend
      try {
        const res = await fetch(`/api/v1/qa/conversations/${data.convId}/summary`, {
          headers: {
            ...(localStorage.getItem('token') ? { Authorization: `Bearer ${localStorage.getItem('token')}` } : {}),
          },
        });
        const result = await res.json();
        if (result.summary) {
          setE('talking');
          // Show summary in speech bubble (longer duration for reading)
          const duration = Math.max(4000, Math.min(result.summary.length * 40, 10000));
          say?.(result.summary, duration);
          await new Promise(r => setTimeout(r, duration + 500));
        } else {
          setE('happy');
          say?.('This conversation is pretty short, take a look!', 2500);
          await new Promise(r => setTimeout(r, 3000));
        }
      } catch {
        setE('happy');
        say?.('Conversation loaded!', 2000);
        await new Promise(r => setTimeout(r, 2500));
      }

      // Return to default position
      const def = getDefaultPos();
      fly(def.x + 90, def.y + 90);
      setE('idle');
    });
  }, []); // Run once — refs keep handlers fresh

  // ── Mount Plugin ──
  useEffect(() => {
    if (!plugin || !containerRef.current || !enabled || !ready) return;
    plugin.mount(containerRef.current);
    return () => plugin.unmount();
  }, [plugin, enabled, ready]);

  // ── Resize Plugin when size changes ──
  useEffect(() => {
    if (!plugin) return;
    const s = window.innerWidth <= 768 ? 100 : size;
    plugin.resize?.(s);
  }, [plugin, size]);

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

  // ── Element Click Reactions (Bot reacts to what you interact with) ──
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      if (draggingRef.current || isFlying.current) return;
      const target = e.target as HTMLElement;
      const say = (window as any).__botSay;
      const setE = setEmotionRef.current;
      const fly = flyToRef.current;
      if (!say || !target) return;

      // Find what was clicked by traversing up
      const clicked = target.closest('[data-bot-react]') as HTMLElement
        || target.closest('.stat-cards > div') as HTMLElement
        || target.closest('.charts-grid > div') as HTMLElement
        || target.closest('.hist-rail .animate-slide-in') as HTMLElement
        || target.closest('.kb-left .animate-slide-in') as HTMLElement
        || target.closest('.nav-item') as HTMLElement;

      if (!clicked) return;

      const rect = clicked.getBoundingClientRect();

      // Stat card clicked
      if (clicked.closest('.stat-cards')) {
        const label = clicked.querySelector('.font-mono')?.textContent || '';
        const value = clicked.querySelector('.font-display:last-child')?.textContent || '';
        fly(rect.left + rect.width / 2, rect.top - 30);
        setE('thinking');
        setTimeout(() => {
          setE('talking');
          say(`${label}: ${value}. Want me to analyze this deeper? 🔍`, 4000);
          setTimeout(() => setE('idle'), 4000);
        }, 600);
        return;
      }

      // Chart clicked
      if (clicked.closest('.charts-grid')) {
        const title = clicked.querySelector('.font-display')?.textContent || 'Chart';
        fly(rect.left + rect.width / 2, rect.top - 30);
        setE('thinking');
        setTimeout(() => {
          say(`Looking at ${title}... I can do deeper analysis if you ask! 📊`, 4000);
          setE('happy');
          setTimeout(() => setE('idle'), 4000);
        }, 600);
        return;
      }

      // Conversation history clicked
      if (clicked.closest('.hist-rail')) {
        const title = clicked.querySelector('div')?.textContent || 'conversation';
        setE('happy');
        say(`Loading "${title.slice(0, 20)}"... 💬`, 2000);
        setTimeout(() => setE('idle'), 2500);
        return;
      }

      // KB collection clicked
      if (clicked.closest('.kb-left')) {
        const name = clicked.querySelector('div > div')?.textContent || 'collection';
        fly(rect.right + 20, rect.top);
        setE('happy');
        setTimeout(() => {
          say(`Opening "${name.slice(0, 20)}"! Upload docs here or I can search them 📂`, 4000);
          setTimeout(() => setE('idle'), 4000);
        }, 600);
        return;
      }
    };

    document.addEventListener('click', handleGlobalClick, true);
    return () => document.removeEventListener('click', handleGlobalClick, true);
  }, []);

  // ── Input Avoidance (Bot moves away when input focused) ──
  useEffect(() => {
    const handleFocus = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (!target || isFlying.current) return;
      if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') {
        const rect = target.getBoundingClientRect();
        const s = getMobileSize();
        const botCenterX = pos.x + s / 2;
        const botCenterY = pos.y + s / 2;
        // Check if bot overlaps with the input area
        const overlaps = botCenterX > rect.left - 50 && botCenterX < rect.right + 50 &&
                         botCenterY > rect.top - 80 && botCenterY < rect.bottom + 80;
        if (overlaps) {
          // Move to top-right area
          flyToRef.current(window.innerWidth - 100, 100);
          (window as any).__botSay?.('I\'ll get out of your way! ✍️', 2000);
        }
      }
    };
    document.addEventListener('focusin', handleFocus);
    return () => document.removeEventListener('focusin', handleFocus);
  }, [pos]);

  // ── Page-Aware Idle Behavior ──
  const chatOpenRef = useRef(chatOpen);
  const draggingRef = useRef(dragging);
  const pathRef = useRef(location.pathname);
  chatOpenRef.current = chatOpen;
  draggingRef.current = dragging;
  pathRef.current = location.pathname;

  useEffect(() => {
    let count = 0;
    const interval = setInterval(async () => {
      if (draggingRef.current || chatOpenRef.current || isFlying.current) return;
      count++;

      const say = (window as any).__botSay;
      const setE = setEmotionRef.current;
      const page = pathRef.current;

      try {
        // Every 20s: page-specific proactive behavior
        if (count % 4 === 0) {
          // Fetch real data and comment based on current page
          const statsRes = await fetch('/api/v1/stats');
          const stats = await statsRes.json();

          if (page === '/dashboard' || page === '/') {
            const insights = [
              stats.total_users > 3 ? `${stats.total_users} users active. The team is growing! 📈` : `Only ${stats.total_users} users so far. Invite more people! 👥`,
              stats.total_messages > 10 ? `${stats.total_messages} messages exchanged. Lots of activity! 💬` : `${stats.total_messages} messages. Try asking me more questions! 📊`,
              stats.total_documents > 0 ? `${stats.total_documents} documents in KB. Knowledge is power! 📚` : `No documents uploaded yet. Upload some docs to KB for better answers! 📄`,
              `System health looks good. ${stats.total_conversations} conversations running ✓`,
            ];
            setE('talking');
            say?.(insights[Math.floor(Math.random() * insights.length)], 5000);
            setTimeout(() => setE('idle'), 5000);
          } else if (page === '/chat') {
            const chatTips = [
              stats.total_conversations > 0 ? `You have ${stats.total_conversations} conversations. Want to continue one? 💬` : `No conversations yet. Ask me anything to get started! ▶`,
              'Try asking: "What are the key metrics?" or "Analyze user trends" 📊',
              'I can also search your uploaded documents! Just ask 📚',
              'Click me for quick commands — I can create KBs, check health, and more 🦀',
            ];
            say?.(chatTips[Math.floor(Math.random() * chatTips.length)], 4000);
          } else if (page === '/kb') {
            const kbRes = await fetch('/api/v1/kb/collections');
            const kbData = await kbRes.json();
            const collections = kbData.collections || [];
            const kbTips = [
              collections.length > 0 ? `${collections.length} knowledge bases. Click one to manage documents! 📂` : `No knowledge bases yet. Create one to start! Click + above 📁`,
              'Upload PDF, Word, Excel, or Markdown files. I\'ll learn from them! 📄',
              'After uploading, ask me questions about the documents in Chat 💬',
              collections.length > 0 ? `Try uploading to "${collections[0].name}" — it has ${collections[0].doc_count} docs 📚` : 'Create a KB like "Product Manual" or "Technical Docs" 📂',
            ];
            setE('thinking');
            say?.(kbTips[Math.floor(Math.random() * kbTips.length)], 5000);
            setTimeout(() => setE('idle'), 5000);
          } else if (page === '/settings') {
            const settingsTips = [
              'You can change my personality here! Try switching to Nexus or Buddy 🔄',
              'Adjust my size with the slider. Bigger = easier to see! 📏',
              'Switch LLM models if DeepSeek is too slow. GPT-4o is faster ⚡',
              'Language setting affects how I respond. Auto matches your language 🌍',
            ];
            say?.(settingsTips[Math.floor(Math.random() * settingsTips.length)], 4000);
          } else if (page === '/admin') {
            const adminTips = [
              'Check MONITOR tab for system health status 🔍',
              'AUDIT tab shows all user actions. Important for compliance! 📋',
              'BOT TOOLS tab lets you enable/disable my capabilities 🔧',
              'You can change user roles in the USERS tab. Be careful with admin! ⚠️',
            ];
            setE('thinking');
            say?.(adminTips[Math.floor(Math.random() * adminTips.length)], 4000);
            setTimeout(() => setE('idle'), 4000);
          }
        } else if (count % 2 === 0) {
          // Every 10s: emotion expression
          const emotions: Array<() => void> = [
            () => { setE('happy'); setTimeout(() => setE('idle'), 2000); },
            () => { setE('thinking'); setTimeout(() => setE('idle'), 2000); },
            () => { setE('surprised'); setTimeout(() => setE('happy'), 500); setTimeout(() => setE('idle'), 2000); },
          ];
          emotions[Math.floor(Math.random() * emotions.length)]();
        }
      } catch {}
    }, 10000);
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
  const dragTrailThrottle = useRef<number>(0);

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
        // Emit trail particles while dragging (throttled)
        if (!dragTrailThrottle.current || Date.now() - dragTrailThrottle.current > 50) {
          dragTrailThrottle.current = Date.now();
          emitTrail(ev.clientX, ev.clientY);
        }
        setPos({
          x: Math.max(10, Math.min(window.innerWidth - size - 10, ev.clientX - dragOffset.current.x)),
          y: Math.max(10, Math.min(window.innerHeight - size - 10, ev.clientY - dragOffset.current.y)),
        });
      }
    };

    const onUp = (ev: MouseEvent) => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (isDragStarted.current) {
        setDragging(false);
        setEmotion('idle');
        (window as any).__botSay?.('Put me down~ ✦', 2000);
        // Persist new position — compute from last mouse position
        const finalX = Math.max(10, Math.min(window.innerWidth - size - 10, ev.clientX - dragOffset.current.x));
        const finalY = Math.max(10, Math.min(window.innerHeight - size - 10, ev.clientY - dragOffset.current.y));
        posOverridden.current = true;
        savePrefs({ position_x: finalX, position_y: finalY });
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

  if (!enabled || !ready) return null;

  return (
    <>
      {/* Beacon (target pulse animation) */}
      {beacon.show && (
        <>
          <div style={{
            position: 'fixed', left: beacon.x - 25, top: beacon.y - 25,
            width: 50, height: 50, borderRadius: '50%',
            border: '2px solid var(--orange)', zIndex: 997,
            animation: 'expand 0.8s ease-in-out infinite',
            pointerEvents: 'none', opacity: 0.7,
          }} />
          <div style={{
            position: 'fixed', left: beacon.x - 15, top: beacon.y - 15,
            width: 30, height: 30, borderRadius: '50%',
            background: 'rgba(212, 82, 26, 0.15)', zIndex: 997,
            animation: 'expand 0.8s ease-in-out infinite 0.2s',
            pointerEvents: 'none',
          }} />
        </>
      )}

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
