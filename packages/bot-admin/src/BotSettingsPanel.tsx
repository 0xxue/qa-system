/**
 * BotSettingsPanel — Bot enable/disable, size, persona settings.
 *
 * Usage:
 *   import { BotSettingsPanel } from '@nexus/bot-admin';
 *   <BotSettingsPanel onSizeChange={(s) => setBotSize(s)} onToggle={(v) => setBotEnabled(v)} />
 */

import { useState, useEffect } from 'react';

export interface BotSettingsPanelProps {
  apiBase?: string;
  getToken?: () => string | null | undefined;
  onSizeChange?: (size: number) => void;
  onToggle?: (enabled: boolean) => void;
  initialSize?: number;
  initialEnabled?: boolean;
}

export function BotSettingsPanel({
  apiBase = '/api/v1/bot',
  getToken = () => localStorage.getItem('token'),
  onSizeChange, onToggle,
  initialSize = 180, initialEnabled = true,
}: BotSettingsPanelProps) {
  const [size, setSize] = useState(initialSize);
  const [enabled, setEnabled] = useState(initialEnabled);

  const headers = (): Record<string, string> => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = getToken();
    if (token) h['Authorization'] = `Bearer ${token}`;
    return h;
  };

  // Load from DB
  useEffect(() => {
    fetch(`${apiBase}/preferences`, { headers: headers() })
      .then(r => r.json())
      .then(p => {
        if (p.bot_size) setSize(p.bot_size);
        if (p.bot_enabled !== undefined) setEnabled(p.bot_enabled);
      })
      .catch(() => {});
  }, []);

  const save = (data: Record<string, any>) => {
    fetch(`${apiBase}/preferences`, { method: 'PUT', headers: headers(), body: JSON.stringify(data) }).catch(() => {});
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
        <input type="checkbox" checked={enabled} onChange={e => {
          setEnabled(e.target.checked);
          onToggle?.(e.target.checked);
          save({ bot_enabled: e.target.checked });
        }} style={{ width: 18, height: 18, accentColor: '#d4521a' }} />
        <span style={{ fontSize: 13 }}>{enabled ? 'Enabled' : 'Disabled'}</span>
      </label>

      {enabled && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 10, color: '#999', minWidth: 30, fontFamily: 'monospace' }}>Size</span>
          <input type="range" min={80} max={260} value={size}
            onChange={e => {
              const v = Number(e.target.value);
              setSize(v);
              onSizeChange?.(v);
              clearTimeout((window as any).__botSizeTimer);
              (window as any).__botSizeTimer = setTimeout(() => save({ bot_size: v }), 500);
            }}
            style={{ flex: 1, maxWidth: 200, accentColor: '#d4521a' }} />
          <span style={{ fontSize: 10, color: '#999', minWidth: 40, fontFamily: 'monospace' }}>{size}px</span>
        </div>
      )}
    </div>
  );
}
