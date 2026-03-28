/**
 * BotManagePanel — Full bot management interface with 4 tabs.
 *
 * Usage:
 *   import { BotManagePanel } from '@nexus/bot-admin';
 *   <BotManagePanel apiBase="/api/v1/bot" getToken={() => token} />
 */

import { useState } from 'react';
import { ScenesTab } from './tabs/ScenesTab';
import { MessagesTab } from './tabs/MessagesTab';
import { AlertsTab } from './tabs/AlertsTab';
import { OverviewTab } from './tabs/OverviewTab';

export interface BotManagePanelProps {
  /** Bot API base URL. Default: "/api/v1/bot" */
  apiBase?: string;
  /** Function to get auth token */
  getToken?: () => string | null | undefined;
  /** Custom title */
  title?: string;
}

type Tab = 'overview' | 'scenes' | 'messages' | 'alerts';

export default function BotManagePanel({ apiBase = '/api/v1/bot', getToken = () => localStorage.getItem('token'), title = 'BOT MANAGE' }: BotManagePanelProps) {
  const [tab, setTab] = useState<Tab>('overview');

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'OVERVIEW' },
    { id: 'scenes', label: 'SCENES' },
    { id: 'messages', label: 'MESSAGES' },
    { id: 'alerts', label: 'ALERTS' },
  ];

  const headers = (): Record<string, string> => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = getToken();
    if (token) h['Authorization'] = `Bearer ${token}`;
    return h;
  };

  const api = { base: apiBase, headers };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '20px 32px 0', flexShrink: 0 }}>
        <h1 style={{ fontSize: 44, letterSpacing: 6, lineHeight: 1, fontFamily: 'var(--font-display, serif)' }}>{title}</h1>
        <p style={{ fontSize: 10, color: '#999', letterSpacing: 1, marginTop: 4, fontFamily: 'monospace' }}>// AI BOT CONFIGURATION CENTER</p>

        <div style={{ display: 'flex', gap: 4, marginTop: 16 }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{
                padding: '8px 16px', fontFamily: 'monospace',
                border: `2px solid ${tab === t.id ? '#d4521a' : '#ddd'}`,
                background: tab === t.id ? 'rgba(212,82,26,0.06)' : 'transparent',
                color: tab === t.id ? '#d4521a' : '#999',
                fontSize: 10, cursor: 'pointer', letterSpacing: 1, transition: 'all 0.2s',
              }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '16px 32px 32px' }}>
        {tab === 'overview' && <OverviewTab api={api} />}
        {tab === 'scenes' && <ScenesTab api={api} />}
        {tab === 'messages' && <MessagesTab api={api} />}
        {tab === 'alerts' && <AlertsTab />}
      </div>
    </div>
  );
}
