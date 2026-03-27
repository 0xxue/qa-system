import ReactMarkdown from 'react-markdown';
import { ChartRenderer } from '../../components/ChartRenderer';
import { Badge } from '../../components/ui/Badge';
import type { Message } from '../../types';

export function MessageBubble({ message: m }: { message: Message }) {
  const isUser = m.role === 'user';

  return (
    <div className="animate-card-in m-row" style={{ display: 'flex', gap: 10, flexDirection: isUser ? 'row-reverse' : 'row' }}>
      {/* Avatar */}
      <div className="font-mono m-av" style={{
        width: 34, height: 34, flexShrink: 0,
        border: `2px solid ${isUser ? 'var(--ink)' : 'var(--orange)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 10, fontWeight: 500,
        color: isUser ? 'var(--ink)' : 'var(--orange)',
        background: isUser ? 'var(--cream)' : 'rgba(212, 82, 26, 0.06)',
      }}>
        {isUser ? 'YOU' : 'AI'}
      </div>

      {/* Bubble */}
      <div className="m-bub" style={{
        maxWidth: '68%', padding: '11px 15px', fontSize: 13.5, lineHeight: 1.65,
        wordBreak: 'break-word', border: `1.5px solid ${isUser ? 'var(--ink)' : 'var(--orange)'}`,
        background: isUser ? 'var(--ink)' : 'rgba(212, 82, 26, 0.04)',
        color: isUser ? 'var(--cream)' : 'var(--ink)',
      }}>
        {m.loading ? (
          <TypingIndicator steps={m.steps} />
        ) : (
          <>
            <div className="prose">
              <ReactMarkdown>{m.content}</ReactMarkdown>
            </div>

            {m.chart && (
              <div style={{ width: '100%', height: 170, marginTop: 10, border: '1.5px solid var(--orange)', background: 'rgba(212, 82, 26, 0.02)' }}>
                <ChartRenderer config={m.chart} />
              </div>
            )}

            {/* Footer: sources + confidence */}
            {(m.sources?.length || m.confidence != null) && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 7 }}>
                {m.sources?.map((s, i) => (
                  <Badge key={i} color="orange">{s.name}</Badge>
                ))}
                {m.confidence != null && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
                    <div style={{ width: 60, height: 4, background: 'var(--warm)', overflow: 'hidden' }}>
                      <div style={{ width: `${Math.round(m.confidence * 100)}%`, height: '100%', background: 'var(--orange)', transition: 'width 1.2s ease' }} />
                    </div>
                    <span className="font-mono" style={{ fontSize: 9, color: 'var(--dim)' }}>
                      {Math.round(m.confidence * 100)}%
                    </span>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function TypingIndicator({ steps }: { steps?: string[] }) {
  return (
    <div>
      <div style={{ display: 'flex', gap: 5, padding: '4px 0' }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: 7, height: 7, background: 'var(--orange)',
            animation: `dotBounce 1.2s ease-in-out infinite ${i * 0.2}s`,
          }} />
        ))}
      </div>
      {steps?.length ? (
        <div className="font-mono" style={{ fontSize: 10, color: 'var(--dim)', marginTop: 4 }}>
          Processing: {steps[steps.length - 1]}...
        </div>
      ) : null}
    </div>
  );
}
