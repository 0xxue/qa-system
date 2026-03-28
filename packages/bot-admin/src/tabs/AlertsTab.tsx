export function AlertsTab() {
  const alerts = [
    { name: 'health', description: 'Database & Redis health check', interval: '60s', priority: 'critical' },
    { name: 'anomaly', description: 'Data anomaly detection (conversation spikes, error rates)', interval: '120s', priority: 'high' },
    { name: 'stats_summary', description: 'Periodic system stats broadcast', interval: '600s', priority: 'low' },
    { name: 'bot_cleanup', description: 'Auto-cleanup bot messages older than 30 days', interval: '3600s', priority: 'low' },
  ];

  return (
    <div>
      <div style={{ fontSize: 10, letterSpacing: 2, color: '#d4521a', marginBottom: 10, fontFamily: 'monospace' }}>ALERT CHECKS</div>
      <p style={{ fontSize: 10, color: '#999', marginBottom: 12, fontFamily: 'monospace' }}>
        Background tasks that monitor system health and push alerts via WebSocket.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {alerts.map(a => (
          <div key={a.name} style={{ padding: '14px 18px', border: '2px solid #222', display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, letterSpacing: 1, fontFamily: 'monospace' }}>{a.name}</div>
              <div style={{ fontSize: 10, color: '#999', marginTop: 2, fontFamily: 'monospace' }}>{a.description}</div>
            </div>
            <div style={{ fontSize: 10, color: '#666', fontFamily: 'monospace' }}>{a.interval}</div>
            <span style={{
              fontSize: 9, padding: '2px 8px', letterSpacing: 1, fontFamily: 'monospace',
              border: `1px solid ${a.priority === 'critical' ? '#c0392b' : a.priority === 'high' ? '#d4521a' : '#ddd'}`,
              color: a.priority === 'critical' ? '#c0392b' : a.priority === 'high' ? '#d4521a' : '#999',
            }}>{a.priority.toUpperCase()}</span>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 10, color: '#999', marginTop: 16, fontFamily: 'monospace' }}>
        Mode filtering: A (companion) = all alerts, B (assistant) = medium+, C (quiet) = critical only
      </div>
    </div>
  );
}
