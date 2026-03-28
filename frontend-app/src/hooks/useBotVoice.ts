/**
 * useBotVoice — Manages voice I/O for the bot system.
 *
 * Features:
 * - Provider-agnostic (swap Browser/API providers)
 * - Push-to-talk or toggle mode
 * - Auto-speak bot responses (configurable)
 * - VRM mouth sync via onSpeakingChange callback
 *
 * Usage:
 *   const { listening, speaking, startListening, stopListening, speak } = useBotVoice();
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type { VoiceProvider, VoiceConfig } from '../types/bot';
import { BrowserVoiceProvider } from '../components/bot/voice/BrowserVoiceProvider';
import { APIVoiceProvider } from '../components/bot/voice/APIVoiceProvider';

const DEFAULT_CONFIG: VoiceConfig = {
  enabled: false,
  sttProvider: 'browser',
  ttsProvider: 'browser',
  lang: 'zh-CN',
  rate: 1.0,
  autoSpeak: true,
};

/** Create a provider instance from config */
function createProvider(config: VoiceConfig): VoiceProvider {
  if (config.ttsProvider === 'edge' || config.ttsProvider === 'openai') {
    return new APIVoiceProvider(config.ttsProvider);
  }
  return new BrowserVoiceProvider();
}

export function useBotVoice(onMessage?: (text: string) => void) {
  const [config, setConfig] = useState<VoiceConfig>(() => {
    try {
      const saved = localStorage.getItem('voice_config');
      return saved ? { ...DEFAULT_CONFIG, ...JSON.parse(saved) } : DEFAULT_CONFIG;
    } catch { return DEFAULT_CONFIG; }
  });

  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [available, setAvailable] = useState(false);

  // Sync config when Settings page changes localStorage
  useEffect(() => {
    const sync = () => {
      try {
        const saved = localStorage.getItem('voice_config');
        if (saved) setConfig(prev => ({ ...prev, ...JSON.parse(saved) }));
      } catch {}
    };
    // Listen for storage events (cross-tab) + custom event (same-tab)
    window.addEventListener('storage', sync);
    window.addEventListener('voice_config_changed', sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener('voice_config_changed', sync);
    };
  }, []);

  const providerRef = useRef<VoiceProvider | null>(null);
  const configRef = useRef(config);
  configRef.current = config;

  // Initialize/switch provider
  useEffect(() => {
    providerRef.current?.destroy();
    const provider = createProvider(config);
    providerRef.current = provider;
    setAvailable(provider.isAvailable());

    // Wire up callbacks
    provider.onResult = (text, isFinal) => {
      setTranscript(text);
      if (isFinal && text.trim()) {
        onMessage?.(text.trim());
        setListening(false);
        setTranscript('');
      }
    };

    provider.onError = (err) => {
      console.warn('[Voice] Error:', err);
      setListening(false);
    };

    provider.onSpeakingChange = (s) => {
      setSpeaking(s);
    };

    return () => provider.destroy();
  }, [config.ttsProvider, config.sttProvider]);

  // Save config to localStorage
  useEffect(() => {
    localStorage.setItem('voice_config', JSON.stringify(config));
  }, [config]);

  const startListening = useCallback(() => {
    if (!providerRef.current || !config.enabled) return;
    setTranscript('');
    setListening(true);
    providerRef.current.startListening({ lang: config.lang });
  }, [config.enabled, config.lang]);

  const stopListening = useCallback(() => {
    providerRef.current?.stopListening();
    setListening(false);
  }, []);

  const speak = useCallback(async (text: string) => {
    if (!providerRef.current || !config.enabled) return;
    await providerRef.current.speak(text, {
      lang: configRef.current.lang,
      rate: configRef.current.rate,
    });
  }, [config.enabled]);

  const stopSpeaking = useCallback(() => {
    providerRef.current?.stopSpeaking();
  }, []);

  const updateConfig = useCallback((updates: Partial<VoiceConfig>) => {
    setConfig(prev => ({ ...prev, ...updates }));
  }, []);

  return {
    config,
    updateConfig,
    listening,
    speaking,
    transcript,
    available,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
  };
}
