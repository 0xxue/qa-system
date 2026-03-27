import client from './client';

export interface StreamCallbacks {
  onStep?: (step: string) => void;
  onContent?: (content: string) => void;
  onSources?: (sources: Array<{ type: string; name: string }>) => void;
  onChart?: (chart: Record<string, unknown>) => void;
  onConfidence?: (confidence: number) => void;
  onConversationId?: (id: number) => void;
  onDone?: () => void;
  onError?: (error: string) => void;
}

export const askQuestion = (query: string, conversationId?: number) =>
  client.post('/qa/ask', { query, conversation_id: conversationId });

export async function streamQuestion(query: string, conversationId?: number, callbacks?: StreamCallbacks) {
  const url = `${import.meta.env.VITE_API_URL || '/api/v1'}/qa/stream`;
  const token = localStorage.getItem('token');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ query, conversation_id: conversationId }),
  });

  if (!response.ok) {
    callbacks?.onError?.(`HTTP ${response.status}`);
    return;
  }

  const reader = response.body?.getReader();
  if (!reader) { callbacks?.onError?.('No stream'); return; }

  const decoder = new TextDecoder();
  let buffer = '';
  let fullAnswer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') { callbacks?.onDone?.(); return; }

      try {
        const evt = JSON.parse(data);
        if (evt.conversation_id) callbacks?.onConversationId?.(evt.conversation_id);
        if (evt.step) callbacks?.onStep?.(evt.step);
        if (evt.answer) { fullAnswer = evt.answer; callbacks?.onContent?.(fullAnswer); }
        if (evt.chunk) { fullAnswer += evt.chunk; callbacks?.onContent?.(fullAnswer); }
        if (evt.sources) callbacks?.onSources?.(evt.sources);
        if (evt.chart) callbacks?.onChart?.(evt.chart);
        if (evt.confidence != null) callbacks?.onConfidence?.(evt.confidence);
        if (evt.error) callbacks?.onError?.(evt.error);
      } catch {}
    }
  }
  callbacks?.onDone?.();
}

export const getConversations = () => client.get('/qa/conversations');
export const getConversation = (id: number) => client.get(`/qa/conversations/${id}`);
export const deleteConversation = (id: number) => client.delete(`/qa/conversations/${id}`);
