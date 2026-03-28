import { useState, useEffect, useCallback } from 'react';

export function MessagesTab({ api }: { api: { base: string; headers: () => Record<string, string> } }) {
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`${api.base}/messages?limit=50`, { headers: api.headers() })
      .then(r => r.json()).then(setMessages).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const cleanup = async () => {
    await fetch(`${api.base}/cleanup`, { method: 'POST', headers: api.headers() });
    load();
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 10, letterSpacing: 2, color: '#d4521a', fontFamily: 'monospace' }}>BOT MESSAGE HISTORY</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={load} style={{ padding: '4px 12px', fontSize: 10, border: '2px solid #222', background: '#d4521a', color: '#fff', cursor: 'pointer', fontFamily: 'monospace' }}>REFRESH</button>
          <button onClick={cleanup} style={{ padding: '4px 12px', fontSize: 10, border: '1.5px solid #c0392b', background: 'none', color: '#c0392b', cursor: 'pointer', fontFamily: 'monospace' }}>CLEANUP 30d+</button>
        </div>
      </div>

      {loading ? (
        <div style={{ fontFamily: 'monospace', color: '#999', fontSize: 11 }}>Loading...</div>
      ) : messages.length === 0 ? (
        <div style={{ fontFamily: 'monospace', color: '#999', fontSize: 11, padding: 20, textAlign: 'center' }}>No bot messages yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {messages.map((m: any) => (
            <div key={m.id} style={{
              display: 'flex', gap: 10, padding: '8px 12px',
              border: `1.5px solid ${m.direction === 'user_to_bot' ? '#222' : '#d4521a'}`,
              background: m.direction === 'user_to_bot' ? 'rgba(0,0,0,0.02)' : 'rgba(212,82,26,0.03)',
            }}>
              <div style={{ fontSize: 9, color: '#999', minWidth: 60, flexShrink: 0, fontFamily: 'monospace' }}>
                {m.direction === 'user_to_bot' ? 'USER' : 'BOT'}
                {m.emotion && <div style={{ color: '#d4521a', marginTop: 2 }}>{m.emotion}</div>}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, wordBreak: 'break-word' }}>{m.content}</div>
                {m.tool_calls?.length > 0 && (
                  <div style={{ fontSize: 9, color: '#999', marginTop: 4, fontFamily: 'monospace' }}>
                    {m.tool_calls.map((t: any, i: number) => (
                      <span key={i} style={{ marginRight: 8 }}>{t.success ? '>' : 'x'} {t.tool}</span>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ fontSize: 9, color: '#999', flexShrink: 0, fontFamily: 'monospace' }}>
                {m.created_at ? new Date(m.created_at).toLocaleString() : ''}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
