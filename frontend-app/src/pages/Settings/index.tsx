import { useState } from 'react';
import { useBotStore } from '../../store/bot';
import { useThemeStore } from '../../store/theme';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { toast } from '../../components/ui/Toast';
import { Bot, Cpu, Palette, Globe, Shield, User } from 'lucide-react';

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

const DEFAULT_PERSONAS = [
  { id: 'clawford', name: 'Clawford', emoji: '🦀', role: 'Senior Data Analyst', personality: 'Professional yet witty, data-driven with a pinch of humor', expertise: 'Financial analysis, business intelligence, KPI tracking', greeting: "Hello! I'm Clawford, your enterprise data analyst 🦀 Ready to crunch some numbers?" },
  { id: 'nexus', name: 'Nexus', emoji: '⚡', role: 'System Operations Engineer', personality: 'Strictly professional, concise, precise', expertise: 'System monitoring, DevOps, performance optimization', greeting: "Nexus online. All systems nominal." },
  { id: 'buddy', name: 'Buddy', emoji: '🎉', role: 'General Assistant', personality: 'Casual, talkative, friendly, lots of emoji', expertise: 'General Q&A, onboarding, feature explanation', greeting: "Hey there! What's up? 🎉" },
];

function loadPersonas() {
  const custom = localStorage.getItem('custom_personas');
  const customs = custom ? JSON.parse(custom) : [];
  return [...DEFAULT_PERSONAS, ...customs];
}

function saveCustomPersona(p: { id: string; name: string; emoji: string; personality: string; greeting: string }) {
  const custom = localStorage.getItem('custom_personas');
  const customs = custom ? JSON.parse(custom) : [];
  const existing = customs.findIndex((c: any) => c.id === p.id);
  if (existing >= 0) customs[existing] = p;
  else customs.push(p);
  localStorage.setItem('custom_personas', JSON.stringify(customs));
}

function deleteCustomPersona(id: string) {
  const custom = localStorage.getItem('custom_personas');
  const customs = custom ? JSON.parse(custom) : [];
  localStorage.setItem('custom_personas', JSON.stringify(customs.filter((c: any) => c.id !== id)));
}

export default function SettingsPage() {
  const { enabled: botEnabled, setEnabled: setBotEnabled, size: botSize, setSize: setBotSize } = useBotStore();
  const { theme } = useThemeStore();

  const [model, setModel] = useState(() => localStorage.getItem('settings_model') || 'deepseek/deepseek-chat');
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('settings_api_key') || '');
  const [language, setLanguage] = useState(() => localStorage.getItem('settings_language') || 'auto');
  const [persona, setPersona] = useState(() => localStorage.getItem('settings_persona') || 'clawford');
  const [personas, setPersonas] = useState(loadPersonas);
  const [editingPersona, setEditingPersona] = useState<any>(null);
  const [showPersonaEditor, setShowPersonaEditor] = useState(false);

  const handlePersonaChange = (id: string) => {
    setPersona(id);
    localStorage.setItem('settings_persona', id);
    const ws = (window as any).__botWs;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'persona_change', persona: id }));
    }
    toast(`Persona: ${personas.find(p => p.id === id)?.name}`, 'success');
  };

  const handleSavePersona = () => {
    if (!editingPersona?.name) return;
    const p = { ...editingPersona, id: editingPersona.id || `custom_${Date.now()}` };
    saveCustomPersona(p);
    setPersonas(loadPersonas());
    setShowPersonaEditor(false);
    setEditingPersona(null);
    // Also send to backend to register
    const ws = (window as any).__botWs;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'register_persona', persona: p }));
    }
    toast(`Persona "${p.name}" saved`, 'success');
  };

  const handleDeletePersona = (id: string) => {
    if (DEFAULT_PERSONAS.find(p => p.id === id)) { toast('Cannot delete built-in persona', 'error'); return; }
    deleteCustomPersona(id);
    setPersonas(loadPersonas());
    if (persona === id) handlePersonaChange('nexus');
    toast('Persona deleted', 'info');
  };

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

      {/* Bot Persona */}
      <SettingSection icon={User} title="BOT PERSONA">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {personas.map(p => (
            <div key={p.id} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
              border: `2px solid ${persona === p.id ? 'var(--orange)' : 'var(--line)'}`,
              background: persona === p.id ? 'rgba(212, 82, 26, 0.06)' : 'transparent',
              cursor: 'pointer', transition: 'all 0.2s',
            }} onClick={() => handlePersonaChange(p.id)}>
              <input type="radio" name="persona" value={p.id} checked={persona === p.id}
                onChange={() => {}} style={{ accentColor: 'var(--orange)' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{p.emoji} {p.name}</div>
                {p.role && <div className="font-mono" style={{ fontSize: 10, color: 'var(--orange)' }}>{p.role}</div>}
                <div className="font-mono" style={{ fontSize: 10, color: 'var(--dim)' }}>{p.personality}</div>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={e => { e.stopPropagation(); setEditingPersona({ ...p }); setShowPersonaEditor(true); }}
                  className="font-mono" style={{ background: 'none', border: '1px solid var(--line)', padding: '2px 6px', fontSize: 9, cursor: 'pointer', color: 'var(--mid)' }}>
                  EDIT
                </button>
                {!DEFAULT_PERSONAS.find(d => d.id === p.id) && (
                  <button onClick={e => { e.stopPropagation(); handleDeletePersona(p.id); }}
                    className="font-mono" style={{ background: 'none', border: '1px solid var(--error)', padding: '2px 6px', fontSize: 9, cursor: 'pointer', color: 'var(--error)' }}>
                    DEL
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        <button onClick={() => { setEditingPersona({ id: '', name: '', emoji: '🤖', personality: '', greeting: '' }); setShowPersonaEditor(true); }}
          className="font-mono" style={{
            marginTop: 10, padding: '8px 14px', border: '2px dashed var(--line)',
            background: 'transparent', color: 'var(--orange)', fontSize: 11,
            cursor: 'pointer', width: '100%', textAlign: 'center',
          }}>
          + CREATE CUSTOM PERSONA
        </button>

        {/* Persona Editor */}
        {showPersonaEditor && editingPersona && (
          <div style={{
            marginTop: 12, padding: 14, border: '2px solid var(--orange)',
            background: 'rgba(212, 82, 26, 0.03)', display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            <div className="font-display" style={{ fontSize: 14, letterSpacing: 2 }}>
              {editingPersona.id ? 'EDIT PERSONA' : 'NEW PERSONA'}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 0 }}>
                <div className="font-mono" style={{ fontSize: 9, color: 'var(--dim)', marginBottom: 4 }}>EMOJI</div>
                <Input value={editingPersona.emoji} onChange={e => setEditingPersona({ ...editingPersona, emoji: e.target.value })}
                  style={{ width: 50, textAlign: 'center', fontSize: 20 }} />
              </div>
              <div style={{ flex: 1 }}>
                <div className="font-mono" style={{ fontSize: 9, color: 'var(--dim)', marginBottom: 4 }}>NAME</div>
                <Input value={editingPersona.name} onChange={e => setEditingPersona({ ...editingPersona, name: e.target.value })}
                  placeholder="e.g. Clawford" />
              </div>
            </div>
            <div>
              <div className="font-mono" style={{ fontSize: 9, color: 'var(--dim)', marginBottom: 4 }}>ROLE / IDENTITY</div>
              <Input value={editingPersona.role || ''} onChange={e => setEditingPersona({ ...editingPersona, role: e.target.value })}
                placeholder="e.g. Senior Data Analyst, HR Manager, DevOps Engineer" />
            </div>
            <div>
              <div className="font-mono" style={{ fontSize: 9, color: 'var(--dim)', marginBottom: 4 }}>PERSONALITY</div>
              <Input value={editingPersona.personality} onChange={e => setEditingPersona({ ...editingPersona, personality: e.target.value })}
                placeholder="e.g. Professional yet witty, data-driven" />
            </div>
            <div>
              <div className="font-mono" style={{ fontSize: 9, color: 'var(--dim)', marginBottom: 4 }}>EXPERTISE</div>
              <Input value={editingPersona.expertise || ''} onChange={e => setEditingPersona({ ...editingPersona, expertise: e.target.value })}
                placeholder="e.g. Financial analysis, KPI tracking, budget planning" />
            </div>
            <div>
              <div className="font-mono" style={{ fontSize: 9, color: 'var(--dim)', marginBottom: 4 }}>GREETING</div>
              <Input value={editingPersona.greeting} onChange={e => setEditingPersona({ ...editingPersona, greeting: e.target.value })}
                placeholder="e.g. Hello! I'm Clawford 🦀" />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button variant="outline" size="sm" onClick={() => { setShowPersonaEditor(false); setEditingPersona(null); }}>CANCEL</Button>
              <Button size="sm" onClick={handleSavePersona}>SAVE</Button>
            </div>
          </div>
        )}
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
