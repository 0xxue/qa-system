import { useState, useEffect, useCallback } from 'react';
import client from '../../api/client';
import { toast } from '../../components/ui/Toast';
import { Button } from '../../components/ui/Button';
import { Cog, MessageSquare, Bell, BarChart3, Save, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';

type Tab = 'scenes' | 'messages' | 'alerts' | 'overview';

export default function BotManagePage() {
  const [tab, setTab] = useState<Tab>('overview');

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: 'overview', label: 'OVERVIEW', icon: BarChart3 },
    { id: 'scenes', label: 'SCENES', icon: Cog },
    { id: 'messages', label: 'MESSAGES', icon: MessageSquare },
    { id: 'alerts', label: 'ALERTS', icon: Bell },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '20px 32px 0', flexShrink: 0 }}>
        <h1 className="font-display" style={{ fontSize: 44, letterSpacing: 6, color: 'var(--ink)', lineHeight: 1 }}>
          BOT MANAGE
        </h1>
        <p className="font-mono" style={{ fontSize: 10, color: 'var(--dim)', letterSpacing: 1, marginTop: 4 }}>
          // AI BOT CONFIGURATION CENTER
        </p>

        <div style={{ display: 'flex', gap: 4, marginTop: 16 }}>
          {tabs.map(t => {
            const Icon = t.icon;
            return (
              <button key={t.id} onClick={() => setTab(t.id)} className="font-mono"
                style={{
                  padding: '8px 16px', border: `2px solid ${tab === t.id ? 'var(--orange)' : 'var(--line)'}`,
                  background: tab === t.id ? 'rgba(212, 82, 26, 0.06)' : 'transparent',
                  color: tab === t.id ? 'var(--orange)' : 'var(--mid)',
                  fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                  letterSpacing: 1, transition: 'all 0.2s',
                }}>
                <Icon size={12} /> {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '16px 32px 32px' }}>
        {tab === 'overview' && <OverviewPanel />}
        {tab === 'scenes' && <ScenesPanel />}
        {tab === 'messages' && <MessagesPanel />}
        {tab === 'alerts' && <AlertsPanel />}
      </div>
    </div>
  );
}

// ══════════════════════════════════════
// Overview Panel
// ══════════════════════════════════════

function OverviewPanel() {
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    client.get('/bot/stats').then((d: any) => setStats(d)).catch(() => {});
  }, []);

  if (!stats) return <div className="font-mono" style={{ color: 'var(--dim)', fontSize: 11 }}>Loading...</div>;

  const cards = [
    { label: 'Total Messages', value: stats.total_messages, color: 'var(--orange)' },
    { label: 'Today', value: stats.messages_today, color: 'var(--ink)' },
    { label: 'Tool Calls', value: stats.tool_call_count, color: '#d4521a' },
    { label: 'Active Users', value: stats.active_users, color: 'var(--mid)' },
    { label: 'Scenes', value: stats.scene_count, color: 'var(--orange)' },
  ];

  return (
    <div>
      <SectionTitle>STATISTICS</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
        {cards.map((c, i) => (
          <div key={i} style={{
            padding: '16px 20px', border: '2px solid var(--ink)', background: 'var(--cream)',
          }}>
            <div className="font-display" style={{ fontSize: 32, letterSpacing: 2, color: c.color }}>{c.value}</div>
            <div className="font-mono" style={{ fontSize: 9, color: 'var(--dim)', letterSpacing: 1, marginTop: 4, textTransform: 'uppercase' }}>{c.label}</div>
          </div>
        ))}
      </div>

      <SectionTitle>MESSAGE BREAKDOWN</SectionTitle>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <div>
          <div className="font-mono" style={{ fontSize: 9, color: 'var(--dim)', letterSpacing: 1, marginBottom: 6 }}>BY TYPE</div>
          {Object.entries(stats.by_type || {}).map(([k, v]) => (
            <div key={k} style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 4 }}>
              <span className="font-mono" style={{ fontSize: 11, color: 'var(--mid)', minWidth: 80 }}>{k}</span>
              <div style={{ height: 8, background: 'var(--orange)', width: Math.max(4, (v as number) * 2), transition: 'width 0.3s' }} />
              <span className="font-mono" style={{ fontSize: 11, color: 'var(--ink)' }}>{v as number}</span>
            </div>
          ))}
        </div>
        <div>
          <div className="font-mono" style={{ fontSize: 9, color: 'var(--dim)', letterSpacing: 1, marginBottom: 6 }}>BY DIRECTION</div>
          {Object.entries(stats.by_direction || {}).map(([k, v]) => (
            <div key={k} style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 4 }}>
              <span className="font-mono" style={{ fontSize: 11, color: 'var(--mid)', minWidth: 80 }}>{k === 'user_to_bot' ? 'User' : 'Bot'}</span>
              <div style={{ height: 8, background: k === 'user_to_bot' ? 'var(--ink)' : 'var(--orange)', width: Math.max(4, (v as number) * 2), transition: 'width 0.3s' }} />
              <span className="font-mono" style={{ fontSize: 11, color: 'var(--ink)' }}>{v as number}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════
// Scenes Panel
// ══════════════════════════════════════

interface Scene {
  id: number;
  scene_key: string;
  priority: string;
  emotion: string;
  action: string | null;
  template: string | null;
  data_action: string | null;
  is_active: boolean;
}

function ScenesPanel() {
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Scene>>({});

  const load = useCallback(() => {
    client.get('/bot/scenes').then((d: any) => setScenes(d)).catch(() => toast('Failed to load scenes', 'error'));
  }, []);

  useEffect(() => { load(); }, [load]);

  const startEdit = (s: Scene) => {
    setEditing(s.scene_key);
    setForm({ priority: s.priority, emotion: s.emotion, action: s.action || '', template: s.template || '', data_action: s.data_action || '', is_active: s.is_active });
  };

  const saveScene = async (key: string) => {
    try {
      await client.put(`/bot/scenes/${key}`, form);
      toast('Scene saved', 'success');
      setEditing(null);
      load();
    } catch {
      toast('Failed to save (admin only)', 'error');
    }
  };

  const toggleActive = async (s: Scene) => {
    try {
      await client.put(`/bot/scenes/${s.scene_key}`, { is_active: !s.is_active });
      load();
    } catch {
      toast('Failed to toggle', 'error');
    }
  };

  const emotions = ['idle', 'happy', 'angry', 'sad', 'thinking', 'talking', 'surprised'];
  const priorities = ['low', 'medium', 'high', 'critical'];
  const actions = ['', 'wave', 'nod', 'think'];

  return (
    <div>
      <SectionTitle>SCENE CONFIGURATION</SectionTitle>
      <p className="font-mono" style={{ fontSize: 10, color: 'var(--dim)', marginBottom: 12 }}>
        Configure how the bot reacts to different events. Click a row to edit.
      </p>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              {['Scene', 'Priority', 'Emotion', 'Action', 'Template', 'Active', ''].map(h => (
                <th key={h} className="font-mono" style={{
                  padding: '8px 10px', textAlign: 'left', fontSize: 9, letterSpacing: 1,
                  borderBottom: '2px solid var(--ink)', color: 'var(--dim)', textTransform: 'uppercase',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {scenes.map(s => (
              <tr key={s.scene_key} style={{
                borderBottom: '1px solid var(--line)',
                opacity: s.is_active ? 1 : 0.4,
                cursor: 'pointer',
              }} onClick={() => editing !== s.scene_key && startEdit(s)}>
                {editing === s.scene_key ? (
                  <>
                    <td style={{ padding: '8px 10px' }}>
                      <span className="font-mono" style={{ fontSize: 11, color: 'var(--orange)' }}>{s.scene_key}</span>
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}
                        className="font-mono" style={{ fontSize: 11, padding: '4px 6px', border: '1.5px solid var(--orange)', background: 'var(--cream)' }}>
                        {priorities.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      <select value={form.emotion} onChange={e => setForm({ ...form, emotion: e.target.value })}
                        className="font-mono" style={{ fontSize: 11, padding: '4px 6px', border: '1.5px solid var(--orange)', background: 'var(--cream)' }}>
                        {emotions.map(em => <option key={em} value={em}>{em}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      <select value={form.action || ''} onChange={e => setForm({ ...form, action: e.target.value || null })}
                        className="font-mono" style={{ fontSize: 11, padding: '4px 6px', border: '1.5px solid var(--orange)', background: 'var(--cream)' }}>
                        {actions.map(a => <option key={a} value={a}>{a || '(none)'}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      <input value={form.template || ''} onChange={e => setForm({ ...form, template: e.target.value })}
                        className="font-mono" style={{ fontSize: 11, padding: '4px 6px', border: '1.5px solid var(--orange)', background: 'var(--cream)', width: '100%', minWidth: 200 }}
                        placeholder="Speech template..." />
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      <button onClick={(e) => { e.stopPropagation(); toggleActive(s); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                        {s.is_active ? <ToggleRight size={18} color="var(--orange)" /> : <ToggleLeft size={18} color="var(--dim)" />}
                      </button>
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <Button onClick={(e: React.MouseEvent) => { e.stopPropagation(); saveScene(s.scene_key); }} style={{ padding: '4px 10px', fontSize: 10 }}>
                          <Save size={10} /> SAVE
                        </Button>
                        <button onClick={(e) => { e.stopPropagation(); setEditing(null); }}
                          className="font-mono" style={{ padding: '4px 10px', fontSize: 10, border: '1.5px solid var(--line)', background: 'none', cursor: 'pointer', color: 'var(--dim)' }}>
                          CANCEL
                        </button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="font-mono" style={{ padding: '8px 10px', fontSize: 11, color: 'var(--ink)' }}>{s.scene_key}</td>
                    <td style={{ padding: '8px 10px' }}>
                      <span className="font-mono" style={{
                        fontSize: 9, padding: '2px 6px', letterSpacing: 1,
                        border: `1px solid ${s.priority === 'critical' ? '#c0392b' : s.priority === 'high' ? 'var(--orange)' : 'var(--line)'}`,
                        color: s.priority === 'critical' ? '#c0392b' : s.priority === 'high' ? 'var(--orange)' : 'var(--dim)',
                      }}>{s.priority.toUpperCase()}</span>
                    </td>
                    <td className="font-mono" style={{ padding: '8px 10px', fontSize: 11, color: 'var(--mid)' }}>{s.emotion}</td>
                    <td className="font-mono" style={{ padding: '8px 10px', fontSize: 11, color: 'var(--dim)' }}>{s.action || '-'}</td>
                    <td className="font-mono" style={{ padding: '8px 10px', fontSize: 11, color: 'var(--mid)', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.template || '-'}</td>
                    <td style={{ padding: '8px 10px' }}>
                      <button onClick={(e) => { e.stopPropagation(); toggleActive(s); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                        {s.is_active ? <ToggleRight size={18} color="var(--orange)" /> : <ToggleLeft size={18} color="var(--dim)" />}
                      </button>
                    </td>
                    <td />
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ══════════════════════════════════════
// Messages Panel
// ══════════════════════════════════════

function MessagesPanel() {
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    client.get('/bot/messages?limit=50').then((d: any) => setMessages(d)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCleanup = async () => {
    try {
      await client.post('/bot/cleanup');
      toast('Old messages cleaned up', 'success');
      load();
    } catch {
      toast('Failed (admin only)', 'error');
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <SectionTitle>BOT MESSAGE HISTORY</SectionTitle>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button onClick={load} style={{ padding: '4px 12px', fontSize: 10 }}>REFRESH</Button>
          <button onClick={handleCleanup} className="font-mono"
            style={{ padding: '4px 12px', fontSize: 10, border: '1.5px solid #c0392b', background: 'none', color: '#c0392b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Trash2 size={10} /> CLEANUP 30d+
          </button>
        </div>
      </div>

      {loading ? (
        <div className="font-mono" style={{ color: 'var(--dim)', fontSize: 11 }}>Loading...</div>
      ) : messages.length === 0 ? (
        <div className="font-mono" style={{ color: 'var(--dim)', fontSize: 11, padding: 20, textAlign: 'center' }}>No bot messages yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {messages.map((m: any) => (
            <div key={m.id} style={{
              display: 'flex', gap: 10, padding: '8px 12px',
              border: `1.5px solid ${m.direction === 'user_to_bot' ? 'var(--ink)' : 'var(--orange)'}`,
              background: m.direction === 'user_to_bot' ? 'rgba(0,0,0,0.02)' : 'rgba(212, 82, 26, 0.03)',
            }}>
              <div className="font-mono" style={{ fontSize: 9, color: 'var(--dim)', minWidth: 60, flexShrink: 0 }}>
                {m.direction === 'user_to_bot' ? 'USER' : 'BOT'}
                {m.emotion && <div style={{ color: 'var(--orange)', marginTop: 2 }}>{m.emotion}</div>}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: 'var(--ink)', wordBreak: 'break-word' }}>{m.content}</div>
                {m.tool_calls && m.tool_calls.length > 0 && (
                  <div className="font-mono" style={{ fontSize: 9, color: 'var(--dim)', marginTop: 4 }}>
                    {m.tool_calls.map((t: any, i: number) => (
                      <span key={i} style={{ marginRight: 8 }}>{t.success ? '>' : 'x'} {t.tool}</span>
                    ))}
                  </div>
                )}
              </div>
              <div className="font-mono" style={{ fontSize: 9, color: 'var(--dim)', flexShrink: 0 }}>
                {m.created_at ? new Date(m.created_at).toLocaleString() : ''}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════
// Alerts Panel
// ══════════════════════════════════════

function AlertsPanel() {
  const alerts = [
    { name: 'health', description: 'Database & Redis health check', interval: '60s', priority: 'critical' },
    { name: 'anomaly', description: 'Data anomaly detection (conversation spikes, error rates)', interval: '120s', priority: 'high' },
    { name: 'stats_summary', description: 'Periodic system stats broadcast', interval: '600s', priority: 'low' },
    { name: 'bot_cleanup', description: 'Auto-cleanup bot messages older than 30 days', interval: '3600s', priority: 'low' },
  ];

  return (
    <div>
      <SectionTitle>ALERT CHECKS</SectionTitle>
      <p className="font-mono" style={{ fontSize: 10, color: 'var(--dim)', marginBottom: 12 }}>
        Background tasks that monitor system health and push alerts via WebSocket.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {alerts.map(a => (
          <div key={a.name} style={{
            padding: '14px 18px', border: '2px solid var(--ink)', background: 'var(--cream)',
            display: 'flex', alignItems: 'center', gap: 16,
          }}>
            <div style={{ flex: 1 }}>
              <div className="font-mono" style={{ fontSize: 12, color: 'var(--ink)', letterSpacing: 1 }}>{a.name}</div>
              <div className="font-mono" style={{ fontSize: 10, color: 'var(--dim)', marginTop: 2 }}>{a.description}</div>
            </div>
            <div className="font-mono" style={{ fontSize: 10, color: 'var(--mid)' }}>{a.interval}</div>
            <span className="font-mono" style={{
              fontSize: 9, padding: '2px 8px', letterSpacing: 1,
              border: `1px solid ${a.priority === 'critical' ? '#c0392b' : a.priority === 'high' ? 'var(--orange)' : 'var(--line)'}`,
              color: a.priority === 'critical' ? '#c0392b' : a.priority === 'high' ? 'var(--orange)' : 'var(--dim)',
            }}>{a.priority.toUpperCase()}</span>
          </div>
        ))}
      </div>

      <div className="font-mono" style={{ fontSize: 10, color: 'var(--dim)', marginTop: 16 }}>
        Mode filtering: A (companion) = all alerts, B (assistant) = medium+, C (quiet) = critical only
      </div>
    </div>
  );
}

// ══════════════════════════════════════
// Shared Components
// ══════════════════════════════════════

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono" style={{ fontSize: 10, letterSpacing: 2, color: 'var(--orange)', textTransform: 'uppercase', marginBottom: 10, paddingBottom: 6, borderBottom: '1.5px solid var(--line)' }}>
      {children}
    </div>
  );
}
