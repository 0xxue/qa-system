/**
 * VoiceSettingsPanel — Voice provider, language, speed settings.
 *
 * Usage:
 *   import { VoiceSettingsPanel } from '@nexus/bot-admin';
 *   <VoiceSettingsPanel />
 */

import { useState } from 'react';

export function VoiceSettingsPanel() {
  const [config, setConfig] = useState(() => {
    try {
      const saved = localStorage.getItem('voice_config');
      return saved ? JSON.parse(saved) : { enabled: false, ttsProvider: 'browser', lang: 'zh-CN', rate: 1.0, autoSpeak: true };
    } catch { return { enabled: false, ttsProvider: 'browser', lang: 'zh-CN', rate: 1.0, autoSpeak: true }; }
  });

  const save = (updates: Record<string, any>) => {
    const next = { ...config, ...updates };
    setConfig(next);
    localStorage.setItem('voice_config', JSON.stringify(next));
    window.dispatchEvent(new Event('voice_config_changed'));
  };

  const hasBrowserSTT = typeof window !== 'undefined' && (
    !!(window as any).SpeechRecognition || !!(window as any).webkitSpeechRecognition
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
        <input type="checkbox" checked={config.enabled} onChange={e => save({ enabled: e.target.checked })}
          style={{ width: 18, height: 18, accentColor: '#d4521a' }} />
        <span style={{ fontSize: 13 }}>{config.enabled ? 'Voice Enabled' : 'Voice Disabled'}</span>
        {!hasBrowserSTT && <span style={{ fontSize: 9, color: '#c0392b', fontFamily: 'monospace' }}>(STT not supported)</span>}
      </label>

      {config.enabled && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 10, color: '#999', minWidth: 80, fontFamily: 'monospace' }}>TTS Provider</span>
            <select value={config.ttsProvider} onChange={e => save({ ttsProvider: e.target.value })}
              style={{ fontSize: 11, padding: '4px 8px', border: '1.5px solid #ddd', fontFamily: 'monospace' }}>
              <option value="browser">Browser Native (Free)</option>
              <option value="edge">Edge TTS (Free, High Quality)</option>
              <option value="openai">OpenAI TTS (Paid, Best)</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 10, color: '#999', minWidth: 80, fontFamily: 'monospace' }}>Language</span>
            <select value={config.lang} onChange={e => save({ lang: e.target.value })}
              style={{ fontSize: 11, padding: '4px 8px', border: '1.5px solid #ddd', fontFamily: 'monospace' }}>
              <option value="zh-CN">Chinese (zh-CN)</option>
              <option value="en-US">English (en-US)</option>
              <option value="ja-JP">Japanese (ja-JP)</option>
              <option value="ko-KR">Korean (ko-KR)</option>
              <option value="de-DE">German (de-DE)</option>
              <option value="fr-FR">French (fr-FR)</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 10, color: '#999', minWidth: 80, fontFamily: 'monospace' }}>Speed</span>
            <input type="range" min={0.5} max={2.0} step={0.1} value={config.rate}
              onChange={e => save({ rate: parseFloat(e.target.value) })}
              style={{ flex: 1, maxWidth: 150, accentColor: '#d4521a' }} />
            <span style={{ fontSize: 10, color: '#999', fontFamily: 'monospace' }}>{config.rate}x</span>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={config.autoSpeak} onChange={e => save({ autoSpeak: e.target.checked })}
              style={{ width: 16, height: 16, accentColor: '#d4521a' }} />
            <span style={{ fontSize: 11, color: '#666', fontFamily: 'monospace' }}>Auto-speak bot responses</span>
          </label>
        </>
      )}
    </div>
  );
}
