/**
 * BotProvider — Configuration context for the Bot system.
 *
 * Wraps all Bot components, providing:
 * - API base URL (where Bot backend lives)
 * - WebSocket URL
 * - Token getter (auth integration)
 * - Route change callback (scene awareness without react-router dependency)
 *
 * Usage:
 *   <BotProvider wsUrl="/ws/bot" apiBase="/api/v1/bot" getToken={() => localStorage.getItem('token')}>
 *     <BotContainer plugin={createVRMBot('/model.vrm')} />
 *   </BotProvider>
 */

import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import type { BotPlugin } from './types';

export interface BotProviderConfig {
  /** WebSocket URL for bot communication. e.g. "/ws/bot" or "wss://example.com/ws/bot" */
  wsUrl: string;
  /** REST API base URL. e.g. "/api/v1/bot" or "https://example.com/api/v1/bot" */
  apiBase: string;
  /** QA API base URL (for conversation summary etc). e.g. "/api/v1/qa" */
  qaApiBase?: string;
  /** Function to get auth token. Return null/undefined for unauthenticated. */
  getToken: () => string | null | undefined;
  /** Optional: listen to route changes for scene awareness */
  currentPath?: string;
}

const BotContext = createContext<BotProviderConfig | null>(null);

export function BotProvider({ children, ...config }: BotProviderConfig & { children: ReactNode }) {
  const value = useMemo(() => config, [config.wsUrl, config.apiBase, config.qaApiBase, config.getToken, config.currentPath]);
  return <BotContext.Provider value={value}>{children}</BotContext.Provider>;
}

export function useBotConfig(): BotProviderConfig {
  const ctx = useContext(BotContext);
  if (!ctx) {
    // Fallback defaults for use without provider (backwards compat)
    return {
      wsUrl: '/ws/bot',
      apiBase: '/api/v1/bot',
      qaApiBase: '/api/v1/qa',
      getToken: () => localStorage.getItem('token'),
    };
  }
  return ctx;
}
