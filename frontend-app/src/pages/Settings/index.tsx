import { useState } from 'react';
import { useBotStore } from '../../store/bot';
import { useThemeStore } from '../../store/theme';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { toast } from '../../components/ui/Toast';
import { Bot, Cpu, Palette, Globe, Shield } from 'lucide-react';

const LLM_MODELS = [
  { value: 'deepseek/deepseek-chat', label: 'DeepSeek Chat', desc: 'Fast & cheap' },
  { value: 'openai/gpt-4o', label: 'GPT-4o', desc: 'Popular' },
  { value: 'anthropic/claude-sonnet-4-20250514', label: 'Claude Sonnet', desc: 'Best quality' },
  { value: 'ollama/llama3', label: 'Ollama Llama3', desc: 'Free, local' },
  { value: 'ollama/qwen2.5', label: 'Ollama Qwen2.5', desc: 'Free, local, Chinese' },
];

const LANGUAGES = [
  { value: 'auto', label: 'Auto (match user)' },
  { value: 'en', label: 'English' },
  { value: 'zh', label: '中文' },
  { value: 'ja', label: '日本語' },
];

export default function SettingsPage() {
  const { enabled: botEnabled, setEnabled: setBotEnabled, size: botSize, setSize: setBotSize } = useBotStore();
  const { theme } = useThemeStore();

  const [model, setModel] = useState(() => localStorage.getItem('settings_model') || 'deepseek/deepseek-chat');
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('settings_api_key') || '');
  const [language, setLanguage] = useState(() => localStorage.getItem('settings_language') || 'auto');

  const handleSaveModel = () => {
    localStorage.setItem('settings_model', model);
    if (apiKey) localStorage.setItem('settings_api_key', apiKey);
    else localStorage.removeItem('settings_api_key');
    toast('Model & API key saved', 'success');
  };

  const handleLanguage = (lang: string) => {
    setLanguage(lang);
    localStorage.setItem('settings_language', lang);
    toast(`Language: ${lang}`, 'success');
  };

  return (
    <div style={{ overflowY: 'auto', padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 24, height: '100%', maxWidth: 700 }}>
      <div>
        <h1 className="font-display" style={{ fontSize: 44, letterSpacing: 6, color: 'var(--ink)', lineHeight: 1 }}>
          SETTINGS
        </h1>
        <p className="font-mono" style={{ fontSize: 10, color: 'var(--dim)', letterSpacing: 1, marginTop: 4 }}>
          // SYSTEM CONFIGURATION
        </p>
      </div>

      {/* LLM Model + API Key — has save button */}
      <SettingSection icon={Cpu} title="LLM MODEL">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {LLM_MODELS.map(m => (
            <label key={m.value} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
              border: `2px solid ${model === m.value ? 'var(--orange)' : 'var(--line)'}`,
              background: model === m.value ? 'rgba(212, 82, 26, 0.06)' : 'transparent',
              cursor: 'pointer', transition: 'all 0.2s',
            }}>
              <input type="radio" name="model" value={m.value} checked={model === m.value}
                onChange={() => setModel(m.value)} style={{ accentColor: 'var(--orange)' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{m.label}</div>
                <div className="font-mono" style={{ fontSize: 10, color: 'var(--dim)' }}>{m.desc}</div>
              </div>
            </label>
          ))}
        </div>

        <div style={{ marginTop: 14 }}>
          <div className="font-mono" style={{ fontSize: 9, color: 'var(--orange)', letterSpacing: 2, marginBottom: 6, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Shield size={10} /> API Key (optional)
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Input type="password" placeholder="sk-... (leave empty for server default)"
              value={apiKey} onChange={e => setApiKey(e.target.value)} style={{ flex: 1 }} />
            <Button onClick={handleSaveModel} size="sm">SAVE</Button>
          </div>
        </div>
      </SettingSection>

      {/* Language — instant save on click */}
      <SettingSection icon={Globe} title="LANGUAGE">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {LANGUAGES.map(l => (
            <button key={l.value} onClick={() => handleLanguage(l.value)} className="font-mono"
              style={{
                padding: '8px 16px', border: `2px solid ${language === l.value ? 'var(--orange)' : 'var(--line)'}`,
                background: language === l.value ? 'rgba(212, 82, 26, 0.06)' : 'var(--cream)',
                color: language === l.value ? 'var(--orange)' : 'var(--ink)',
                fontSize: 12, cursor: 'pointer', transition: 'all 0.2s',
              }}>
              {l.label}
            </button>
          ))}
        </div>
      </SettingSection>

      {/* Theme — instant */}
      <SettingSection icon={Palette} title="THEME">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="font-mono" style={{
            padding: '8px 16px', border: '2px solid var(--orange)',
            background: 'rgba(212, 82, 26, 0.06)', color: 'var(--orange)',
            fontSize: 12, cursor: 'default', textTransform: 'uppercase',
          }}>
            NEXUS WARM
          </button>
          <span className="font-mono" style={{ fontSize: 10, color: 'var(--dim)' }}>
            Dark mode coming soon
          </span>
        </div>
      </SettingSection>

      {/* Bot — instant toggle + slider */}
      <SettingSection icon={Bot} title="3D BOT">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={botEnabled} onChange={e => setBotEnabled(e.target.checked)}
              style={{ width: 18, height: 18, accentColor: 'var(--orange)' }} />
            <span style={{ fontSize: 13 }}>{botEnabled ? 'Enabled' : 'Disabled'}</span>
          </label>
          {botEnabled && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="font-mono" style={{ fontSize: 10, color: 'var(--dim)', minWidth: 30 }}>Size</span>
              <input type="range" min={80} max={260} value={botSize}
                onChange={e => setBotSize(Number(e.target.value))}
                style={{ flex: 1, maxWidth: 200, accentColor: 'var(--orange)' }} />
              <span className="font-mono" style={{ fontSize: 10, color: 'var(--dim)', minWidth: 40 }}>{botSize}px</span>
            </div>
          )}
        </div>
      </SettingSection>
    </div>
  );
}

function SettingSection({ icon: Icon, title, children }: {
  icon: any; title: string; children: React.ReactNode;
}) {
  return (
    <div className="animate-card-in" style={{ border: '2px solid var(--ink)', padding: '18px 20px', background: 'var(--cream)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <Icon size={16} color="var(--orange)" />
        <span className="font-display" style={{ fontSize: 16, letterSpacing: 3 }}>{title}</span>
      </div>
      {children}
    </div>
  );
}
