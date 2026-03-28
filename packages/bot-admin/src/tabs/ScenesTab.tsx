import { useState, useEffect, useCallback } from 'react';

interface Scene {
  id: number; scene_key: string; priority: string; emotion: string;
  action: string | null; template: string | null; data_action: string | null; is_active: boolean;
}

export function ScenesTab({ api }: { api: { base: string; headers: () => Record<string, string> } }) {
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Scene>>({});

  const load = useCallback(() => {
    fetch(`${api.base}/scenes`, { headers: api.headers() })
      .then(r => r.json()).then(setScenes).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async (key: string) => {
    await fetch(`${api.base}/scenes/${key}`, { method: 'PUT', headers: api.headers(), body: JSON.stringify(form) });
    setEditing(null);
    load();
  };

  const toggle = async (s: Scene) => {
    await fetch(`${api.base}/scenes/${s.scene_key}`, { method: 'PUT', headers: api.headers(), body: JSON.stringify({ is_active: !s.is_active }) });
    load();
  };

  const emotions = ['idle', 'happy', 'angry', 'sad', 'thinking', 'talking', 'surprised'];
  const priorities = ['low', 'medium', 'high', 'critical'];
  const actions = ['', 'wave', 'nod', 'think'];

  return (
    <div>
      <p style={{ fontSize: 10, color: '#999', marginBottom: 12, fontFamily: 'monospace' }}>
        Configure how the bot reacts to different events. Click a row to edit.
      </p>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr>
            {['Scene', 'Priority', 'Emotion', 'Action', 'Template', 'Active', ''].map(h => (
              <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 9, letterSpacing: 1, borderBottom: '2px solid #222', color: '#999', fontFamily: 'monospace' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {scenes.map(s => (
            <tr key={s.scene_key} style={{ borderBottom: '1px solid #eee', opacity: s.is_active ? 1 : 0.4, cursor: 'pointer' }}
              onClick={() => { if (editing !== s.scene_key) { setEditing(s.scene_key); setForm({ priority: s.priority, emotion: s.emotion, action: s.action || '', template: s.template || '' }); } }}>
              {editing === s.scene_key ? (
                <>
                  <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontSize: 11, color: '#d4521a' }}>{s.scene_key}</td>
                  <td style={{ padding: '8px 10px' }}>
                    <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })} style={{ fontSize: 11, padding: '4px', border: '1.5px solid #d4521a', fontFamily: 'monospace' }}>
                      {priorities.map(p => <option key={p}>{p}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '8px 10px' }}>
                    <select value={form.emotion} onChange={e => setForm({ ...form, emotion: e.target.value })} style={{ fontSize: 11, padding: '4px', border: '1.5px solid #d4521a', fontFamily: 'monospace' }}>
                      {emotions.map(e => <option key={e}>{e}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '8px 10px' }}>
                    <select value={form.action || ''} onChange={e => setForm({ ...form, action: e.target.value || null })} style={{ fontSize: 11, padding: '4px', border: '1.5px solid #d4521a', fontFamily: 'monospace' }}>
                      {actions.map(a => <option key={a} value={a}>{a || '(none)'}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '8px 10px' }}>
                    <input value={form.template || ''} onChange={e => setForm({ ...form, template: e.target.value })} style={{ fontSize: 11, padding: '4px', border: '1.5px solid #d4521a', width: '100%', minWidth: 200, fontFamily: 'monospace' }} />
                  </td>
                  <td style={{ padding: '8px 10px' }}>
                    <button onClick={e => { e.stopPropagation(); toggle(s); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>
                      {s.is_active ? '🟢' : '⚫'}
                    </button>
                  </td>
                  <td style={{ padding: '8px 10px', display: 'flex', gap: 4 }}>
                    <button onClick={e => { e.stopPropagation(); save(s.scene_key); }} style={{ padding: '4px 10px', fontSize: 10, background: '#d4521a', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'monospace' }}>SAVE</button>
                    <button onClick={e => { e.stopPropagation(); setEditing(null); }} style={{ padding: '4px 10px', fontSize: 10, border: '1px solid #ddd', background: 'none', cursor: 'pointer', fontFamily: 'monospace' }}>CANCEL</button>
                  </td>
                </>
              ) : (
                <>
                  <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontSize: 11 }}>{s.scene_key}</td>
                  <td style={{ padding: '8px 10px' }}>
                    <span style={{ fontSize: 9, padding: '2px 6px', border: `1px solid ${s.priority === 'critical' ? '#c0392b' : '#ddd'}`, color: s.priority === 'critical' ? '#c0392b' : '#999', fontFamily: 'monospace' }}>{s.priority.toUpperCase()}</span>
                  </td>
                  <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontSize: 11, color: '#666' }}>{s.emotion}</td>
                  <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontSize: 11, color: '#999' }}>{s.action || '-'}</td>
                  <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontSize: 11, color: '#666', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.template || '-'}</td>
                  <td style={{ padding: '8px 10px' }}>
                    <button onClick={e => { e.stopPropagation(); toggle(s); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>
                      {s.is_active ? '🟢' : '⚫'}
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
  );
}
