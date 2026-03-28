import { useState, useEffect } from 'react';

export function OverviewTab({ api }: { api: { base: string; headers: () => Record<string, string> } }) {
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    fetch(`${api.base}/stats`, { headers: api.headers() })
      .then(r => r.json()).then(setStats).catch(() => {});
  }, []);

  if (!stats) return <div style={{ fontFamily: 'monospace', color: '#999', fontSize: 11 }}>Loading...</div>;

  const cards = [
    { label: 'Total Messages', value: stats.total_messages },
    { label: 'Today', value: stats.messages_today },
    { label: 'Tool Calls', value: stats.tool_call_count },
    { label: 'Active Users', value: stats.active_users },
    { label: 'Scenes', value: stats.scene_count },
  ];

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
        {cards.map((c, i) => (
          <div key={i} style={{ padding: '16px 20px', border: '2px solid #222' }}>
            <div style={{ fontSize: 32, letterSpacing: 2, color: '#d4521a', fontFamily: 'var(--font-display, serif)' }}>{c.value}</div>
            <div style={{ fontSize: 9, color: '#999', letterSpacing: 1, marginTop: 4, textTransform: 'uppercase', fontFamily: 'monospace' }}>{c.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        {[
          { title: 'BY TYPE', data: stats.by_type },
          { title: 'BY DIRECTION', data: stats.by_direction },
        ].map(section => (
          <div key={section.title}>
            <div style={{ fontSize: 9, color: '#999', letterSpacing: 1, marginBottom: 6, fontFamily: 'monospace' }}>{section.title}</div>
            {Object.entries(section.data || {}).map(([k, v]) => (
              <div key={k} style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: '#666', minWidth: 80, fontFamily: 'monospace' }}>{k}</span>
                <div style={{ height: 8, background: '#d4521a', width: Math.max(4, (v as number) * 2) }} />
                <span style={{ fontSize: 11, fontFamily: 'monospace' }}>{v as number}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
