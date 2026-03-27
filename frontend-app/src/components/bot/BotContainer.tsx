import { useEffect, useRef, useState, useCallback } from 'react';
import type { BotPlugin, BotEmotion } from '../../types/bot';
import { useBotStore } from '../../store/bot';

/**
 * BotContainer — Floating draggable container for any bot plugin.
 *
 * The bot plugin is injected via the store (setBotPlugin).
 * If no plugin is set or bot is disabled, nothing renders.
 *
 * To use a custom bot:
 *   import { useBotStore } from './store/bot';
 *   useBotStore.getState().setBotPlugin(myPlugin);
 */

export function BotContainer() {
  const { enabled, plugin, size, emotion } = useBotStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: window.innerWidth - 210, y: window.innerHeight - 250 });
  const [dragging, setDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const [speechText, setSpeechText] = useState('');
  const speechTimer = useRef<ReturnType<typeof setTimeout>>();

  // Mount plugin
  useEffect(() => {
    if (!plugin || !containerRef.current || !enabled) return;
    plugin.mount(containerRef.current);
    return () => plugin.unmount();
  }, [plugin, enabled]);

  // Sync emotion to plugin
  useEffect(() => {
    if (!plugin) return;
    plugin.setEmotion(emotion);
    if (emotion === 'talking') plugin.startTalking();
    else plugin.stopTalking();
  }, [plugin, emotion]);

  // Expose speech function globally
  useEffect(() => {
    (window as any).__botSay = (text: string, duration = 3000) => {
      setSpeechText(text);
      if (speechTimer.current) clearTimeout(speechTimer.current);
      speechTimer.current = setTimeout(() => setSpeechText(''), duration);
    };
    return () => { delete (window as any).__botSay; };
  }, []);

  // Drag handlers
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
    const onUp = () => setDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [dragging, size]);

  // Idle float
  const floatPhase = useRef(0);
  const [float, setFloat] = useState({ x: 0, y: 0 });
  useEffect(() => {
    if (dragging) return;
    let raf: number;
    const loop = () => {
      floatPhase.current += 0.008;
      setFloat({
        x: Math.sin(floatPhase.current) * 4,
        y: Math.cos(floatPhase.current * 1.3) * 5,
      });
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
          left: pos.x - 120,
          top: pos.y - 50,
          zIndex: 1001,
          maxWidth: 210,
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

      {/* Bot container */}
      <div
        data-bot-container
        onMouseDown={onMouseDown}
        style={{
          position: 'fixed',
          left: pos.x + (dragging ? 0 : float.x),
          top: pos.y + (dragging ? 0 : float.y),
          width: 180,
          height: 180,
          zIndex: 1000,
          cursor: dragging ? 'grabbing' : 'pointer',
          userSelect: 'none',
          transition: dragging ? 'none' : 'left 0.7s cubic-bezier(0.34,1.2,0.64,1), top 0.7s cubic-bezier(0.34,1.2,0.64,1)',
          filter: `drop-shadow(0 0 20px rgba(212, 82, 26, ${dragging ? 0.5 : 0.25}))`,
          transform: `scale(${size / 180})${dragging ? ' scale(1.08)' : ''}`,
          transformOrigin: 'center center',
          overflow: 'visible',
        }}
      >
        <div ref={containerRef} style={{ width: '100%', height: '100%', cursor: 'inherit' }} />
      </div>
    </>
  );
}
