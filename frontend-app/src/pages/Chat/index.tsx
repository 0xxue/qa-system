import { useState, useRef, useEffect, useCallback } from 'react';
import { useChatStore } from '../../store/chat';
import { useBotStore } from '../../store/bot';
import { streamQuestion, getConversations, getConversation, deleteConversation } from '../../api/qa';
import { MessageBubble } from './MessageBubble';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from '../../components/ui/Toast';
import type { Message } from '../../types';

const SUGGESTED = [
  'Show me the system overview',
  'What items are expiring this week?',
  'How is user growth trending?',
  'Summarize the key metrics',
];

export default function ChatPage() {
  const {
    messages, conversations, streaming, conversationId,
    addMessage, updateLastMessage, setStreaming,
    setConversationId, setConversations, clearMessages, setMessages,
  } = useChatStore();
  const setEmotion = useBotStore(s => s.setEmotion);
  const [input, setInput] = useState('');
  const msgsRef = useRef<HTMLDivElement>(null);

  // Bot speech bubble helper
  const botSay = (text: string) => {
    (window as any).__botSay?.(text, 3000);
  };

  // Load conversations on mount
  const refreshConversations = useCallback(() => {
    getConversations().then(setConversations).catch(() => {});
  }, [setConversations]);

  useEffect(() => {
    refreshConversations();
  }, [refreshConversations]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (msgsRef.current) msgsRef.current.scrollTop = msgsRef.current.scrollHeight;
  }, [messages]);

  // Load conversation messages when clicking history
  const loadConversation = useCallback(async (convId: number) => {
    if (convId === conversationId) return;
    try {
      const data = await getConversation(convId);
      if (data && data.messages) {
        const msgs: Message[] = data.messages.map((m: any) => ({
          id: String(m.id),
          role: m.role,
          content: m.content,
          sources: m.sources,
          chart: m.chart,
          confidence: m.confidence,
        }));
        setConversationId(convId);
        setMessages(msgs);
      }
    } catch {
      toast('Failed to load conversation', 'error');
    }
  }, [conversationId, setConversationId, setMessages]);

  // New conversation
  const newConversation = useCallback(() => {
    clearMessages();
    // conversationId is set to null, next message will create a new one on backend
  }, [clearMessages]);

  // Delete conversation
  const handleDelete = useCallback(async (convId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteConversation(convId);
      if (convId === conversationId) clearMessages();
      refreshConversations();
      toast('Conversation deleted', 'info');
    } catch {
      toast('Failed to delete', 'error');
    }
  }, [conversationId, clearMessages, refreshConversations]);

  // Send message
  const sendMsg = async (text: string) => {
    if (!text.trim() || streaming) return;

    const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', content: text };
    addMessage(userMsg);

    const aiMsg: Message = { id: `a-${Date.now()}`, role: 'assistant', content: '', loading: true, steps: [] };
    addMessage(aiMsg);
    setStreaming(true);
    setEmotion('thinking');
    botSay('Let me think about that...');

    const STEP_MESSAGES: Record<string, string> = {
      detect_intent: 'Analyzing your question...',
      classify_source: 'Identifying data sources...',
      rag_search: 'Searching knowledge base...',
      rerank_results: 'Ranking results...',
      rewrite_query: 'Refining search query...',
      fetch_data: 'Fetching data from APIs...',
      check_sufficiency: 'Checking data completeness...',
      analyze: 'Running AI analysis...',
      check_hallucination: 'Verifying accuracy...',
      generate_chart: 'Generating chart...',
      format_response: 'Formatting answer...',
      fallback: 'Using general knowledge...',
    };

    try {
      await streamQuestion(text, conversationId ?? undefined, {
        onConversationId: (id) => { setConversationId(id); refreshConversations(); },
        onStep: (step) => {
          updateLastMessage({ steps: [...(useChatStore.getState().messages.at(-1)?.steps || []), step] });
          botSay(STEP_MESSAGES[step] || `Processing: ${step}`);
        },
        onContent: (content) => { updateLastMessage({ content, loading: false }); setEmotion('talking'); botSay('Here is what I found...'); },
        onSources: (sources) => updateLastMessage({ sources }),
        onChart: (chart) => updateLastMessage({ chart }),
        onConfidence: (confidence) => updateLastMessage({ confidence }),
        onDone: () => {
          setStreaming(false);
          setEmotion('happy');
          botSay('Done! Let me know if you need more.');
          setTimeout(() => setEmotion('idle'), 3000);
          // Delay refresh to allow backend to finish saving
          setTimeout(() => refreshConversations(), 1500);
        },
        onError: (err) => {
          updateLastMessage({ content: `Error: ${err}`, loading: false });
          setStreaming(false);
          setEmotion('sad');
          botSay('Oops, something went wrong...');
          setTimeout(() => setEmotion('idle'), 3000);
        },
      });
    } catch {
      updateLastMessage({ content: 'Connection failed. Please check the backend.', loading: false });
      setStreaming(false);
      setEmotion('idle');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const t = input.trim();
      if (t) { setInput(''); sendMsg(t); }
    }
  };

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {/* History rail */}
      <div className="hist-rail" style={{
        width: 200, borderRight: '1.5px solid var(--line)',
        display: 'flex', flexDirection: 'column', background: 'rgba(232, 220, 200, 0.5)',
      }}>
        <div style={{
          padding: '14px 14px 10px', borderBottom: '1.5px solid var(--line)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span className="font-mono" style={{ fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--mid)' }}>
            Conversations
          </span>
          <button
            onClick={newConversation}
            title="New Conversation"
            style={{ width: 26, height: 26, border: '1.5px solid var(--line)', background: 'var(--cream)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <Plus size={14} color="var(--orange)" />
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {conversations.length === 0 && (
            <div className="font-mono" style={{ padding: '20px 14px', fontSize: 10, color: 'var(--dim)', textAlign: 'center' }}>
              No conversations yet.<br />Start by asking a question.
            </div>
          )}
          {conversations.map(c => (
            <div
              key={c.id}
              onClick={() => loadConversation(c.id)}
              className="animate-slide-in"
              style={{
                padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center',
                borderLeft: c.id === conversationId ? '3px solid var(--orange)' : '3px solid transparent',
                background: c.id === conversationId ? 'rgba(212, 82, 26, 0.08)' : 'transparent',
                transition: 'background 0.2s',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 3 }}>
                  {c.title}
                </div>
                <div className="font-mono" style={{ fontSize: 9, color: 'var(--dim)' }}>
                  {c.message_count} msgs
                </div>
              </div>
              <button
                onClick={(e) => handleDelete(c.id, e)}
                title="Delete"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, opacity: 0.4, transition: 'opacity 0.2s' }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '0.4')}
              >
                <Trash2 size={12} color="var(--dim)" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Chat body */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div ref={msgsRef} style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
          {messages.length === 0 ? (
            <EmptyState onSuggest={sendMsg} />
          ) : (
            messages.map(m => <MessageBubble key={m.id} message={m} />)
          )}
        </div>

        {/* Input */}
        <div className="chat-input-zone" style={{
          padding: '14px 24px', borderTop: '2px solid var(--ink)',
          display: 'flex', alignItems: 'flex-end', gap: 10, background: 'var(--cream)',
        }}>
          <div style={{ flex: 1 }}>
            <div className="font-mono" style={{ fontSize: 9, color: 'var(--orange)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 }}>
              // INPUT QUERY
            </div>
            <div style={{ border: '2px solid var(--ink)', display: 'flex', alignItems: 'flex-end' }}>
              <textarea
                value={input}
                onChange={e => { setInput(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px'; }}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything about your data..."
                disabled={streaming}
                className="font-mono"
                style={{
                  flex: 1, background: 'none', border: 'none', outline: 'none',
                  padding: '10px 12px', fontSize: 13, color: 'var(--ink)',
                  resize: 'none', maxHeight: 100, lineHeight: 1.5,
                }}
              />
              <button
                onClick={() => { const t = input.trim(); if (t) { setInput(''); sendMsg(t); } }}
                disabled={streaming || !input.trim()}
                style={{
                  width: 44, height: 44, border: 'none', cursor: 'pointer',
                  background: streaming ? 'var(--dim)' : 'var(--orange)', color: 'var(--cream)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.2s', flexShrink: 0,
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ onSuggest }: { onSuggest: (q: string) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 28 }}>
      <div style={{ position: 'relative', width: 160, height: 160 }}>
        {[60, 100, 140].map((size, i) => (
          <div key={i} style={{
            position: 'absolute', borderRadius: '50%', border: '1.5px solid rgba(212, 82, 26, 0.3)',
            width: size, height: size, left: '50%', top: '50%',
            transform: 'translate(-50%, -50%)', animation: `expand 4s ease-in-out infinite ${i * 0.5}s`,
          }} />
        ))}
        <div className="font-display" style={{
          position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
          fontSize: 18, letterSpacing: 3, color: 'var(--orange)',
        }}>◈</div>
      </div>
      <h2 className="font-display" style={{ fontSize: 36, letterSpacing: 6, color: 'var(--ink)' }}>READY FOR LAUNCH</h2>
      <p className="font-mono" style={{ fontSize: 11, color: 'var(--dim)', letterSpacing: 1 }}>// SELECT A MISSION OR TYPE YOUR QUERY</p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 500 }}>
        {SUGGESTED.map((q, i) => (
          <button key={i} onClick={() => onSuggest(q)} className="font-mono animate-card-in"
            style={{ padding: '8px 14px', border: '1.5px solid var(--line)', background: 'var(--cream)', color: 'var(--mid)', fontSize: 11, cursor: 'pointer', transition: 'all 0.2s', animationDelay: `${i * 0.1}s` }}
            onMouseEnter={e => { (e.target as HTMLElement).style.borderColor = 'var(--orange)'; (e.target as HTMLElement).style.color = 'var(--orange)'; }}
            onMouseLeave={e => { (e.target as HTMLElement).style.borderColor = 'var(--line)'; (e.target as HTMLElement).style.color = 'var(--mid)'; }}>
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}
