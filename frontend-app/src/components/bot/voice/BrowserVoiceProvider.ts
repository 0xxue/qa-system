/**
 * Browser Voice Provider — Uses Web Speech API (free, zero config)
 *
 * STT: SpeechRecognition (Chrome, Edge, Safari)
 * TTS: SpeechSynthesis (all modern browsers)
 *
 * Limitations:
 * - STT requires HTTPS in production (localhost exempt)
 * - Voice quality varies by OS/browser
 * - Some languages have limited support
 */

import type { VoiceProvider, VoiceTTSOptions } from '../../../types/bot';

// Cross-browser SpeechRecognition
const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

export class BrowserVoiceProvider implements VoiceProvider {
  readonly name = 'browser';
  private recognition: any = null;
  private synth = window.speechSynthesis;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private _isSpeaking = false;

  // Callbacks
  onResult: ((text: string, isFinal: boolean) => void) | null = null;
  onError: ((error: string) => void) | null = null;
  onSpeakingChange: ((speaking: boolean) => void) | null = null;

  isAvailable(): boolean {
    return !!SpeechRecognition && !!window.speechSynthesis;
  }

  // ── STT ──

  startListening(options?: { lang?: string }): void {
    if (!SpeechRecognition) {
      this.onError?.('SpeechRecognition not supported in this browser');
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = false;
    this.recognition.interimResults = true;
    this.recognition.lang = options?.lang || 'zh-CN';

    this.recognition.onresult = (event: any) => {
      let transcript = '';
      let isFinal = false;
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
        if (event.results[i].isFinal) isFinal = true;
      }
      this.onResult?.(transcript, isFinal);
    };

    this.recognition.onerror = (event: any) => {
      if (event.error !== 'aborted') {
        this.onError?.(event.error);
      }
    };

    this.recognition.start();
  }

  stopListening(): void {
    this.recognition?.stop();
    this.recognition = null;
  }

  // ── TTS ──

  async speak(text: string, options?: VoiceTTSOptions): Promise<void> {
    // Cancel any ongoing speech
    this.synth.cancel();

    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = options?.lang || 'zh-CN';
      utterance.rate = options?.rate ?? 1.0;
      utterance.pitch = options?.pitch ?? 1.0;

      // Try to find requested voice
      if (options?.voice) {
        const voices = this.synth.getVoices();
        const match = voices.find(v => v.name === options.voice || v.voiceURI === options.voice);
        if (match) utterance.voice = match;
      }

      utterance.onstart = () => {
        this._isSpeaking = true;
        this.onSpeakingChange?.(true);
      };

      utterance.onend = () => {
        this._isSpeaking = false;
        this.onSpeakingChange?.(false);
        this.currentUtterance = null;
        resolve();
      };

      utterance.onerror = () => {
        this._isSpeaking = false;
        this.onSpeakingChange?.(false);
        this.currentUtterance = null;
        resolve();
      };

      this.currentUtterance = utterance;
      this.synth.speak(utterance);
    });
  }

  stopSpeaking(): void {
    this.synth.cancel();
    this._isSpeaking = false;
    this.onSpeakingChange?.(false);
    this.currentUtterance = null;
  }

  isSpeaking(): boolean {
    return this._isSpeaking;
  }

  destroy(): void {
    this.stopListening();
    this.stopSpeaking();
    this.onResult = null;
    this.onError = null;
    this.onSpeakingChange = null;
  }
}

/** Get available TTS voices (async because voices load lazily in some browsers) */
export function getAvailableVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      resolve(voices);
    } else {
      window.speechSynthesis.onvoiceschanged = () => {
        resolve(window.speechSynthesis.getVoices());
      };
    }
  });
}
