/**
 * @nexus/bot-admin — Bot Management UI Components
 *
 * Drop-in admin panels for managing your AI Bot:
 * - Scene configuration (CRUD)
 * - Message history viewer
 * - Alert check overview
 * - Usage statistics dashboard
 * - Voice settings panel
 * - Bot settings panel (size, persona, enable/disable)
 *
 * Quick start:
 *   import { BotManagePanel, BotSettingsPanel } from '@nexus/bot-admin';
 *
 *   <Route path="/bot-manage" element={<BotManagePanel />} />
 */

export { default as BotManagePanel } from './BotManagePanel';
export { BotSettingsPanel } from './BotSettingsPanel';
export { VoiceSettingsPanel } from './VoiceSettingsPanel';
