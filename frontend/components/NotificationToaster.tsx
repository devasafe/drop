import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import Icon from './Icon';
import type { NotifyKind } from '../lib/notify';

interface Toast {
  id: number;
  kind: NotifyKind;
  title: string;
  body?: string;
  url?: string;
}

/** Toaster global chamativo. Escuta o evento 'drop:toast' disparado por lib/notify. */
export default function NotificationToaster() {
  const router = useRouter();
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent).detail || {};
      const id = Date.now() + Math.random();
      const toast: Toast = {
        id,
        kind: d.kind === 'order' ? 'order' : 'message',
        title: d.title || 'Notificação',
        body: d.body,
        url: d.url,
      };
      setToasts(prev => [toast, ...prev].slice(0, 4));
      setTimeout(() => remove(id), 7000);
    };
    window.addEventListener('drop:toast', handler);
    return () => window.removeEventListener('drop:toast', handler);
  }, [remove]);

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 76,
        right: 20,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        width: 340,
        maxWidth: 'calc(100vw - 40px)',
        pointerEvents: 'none',
      }}
    >
      {toasts.map(t => {
        const isOrder = t.kind === 'order';
        const accent = isOrder ? '#F59E0B' : '#8B5CF6';
        return (
          <div
            key={t.id}
            onClick={() => { if (t.url) router.push(t.url); remove(t.id); }}
            style={{
              pointerEvents: 'auto',
              cursor: t.url ? 'pointer' : 'default',
              background: '#161616',
              border: `1px solid ${accent}`,
              borderLeft: `4px solid ${accent}`,
              borderRadius: 12,
              padding: '12px 14px',
              color: 'rgba(255,255,255,0.92)',
              fontFamily: "'Inter', sans-serif",
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start',
              boxShadow: `0 10px 30px rgba(0,0,0,0.5), 0 0 18px ${accent}55`,
              animation: isOrder
                ? 'dropToastIn 0.35s cubic-bezier(0.22,1,0.36,1), dropToastPulse 1.4s ease-in-out infinite'
                : 'dropToastIn 0.35s cubic-bezier(0.22,1,0.36,1)',
            }}
          >
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 9,
                background: `${accent}22`,
                color: accent,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Icon name={isOrder ? 'package' : 'chat'} size={18} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif", marginBottom: 2 }}>
                {t.title}
              </div>
              {t.body && (
                <div
                  style={{
                    fontSize: 12.5,
                    color: 'rgba(255,255,255,0.6)',
                    lineHeight: 1.4,
                    overflow: 'hidden',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                  }}
                >
                  {t.body}
                </div>
              )}
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); remove(t.id); }}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'rgba(255,255,255,0.4)',
                cursor: 'pointer',
                fontSize: 16,
                lineHeight: 1,
                padding: 0,
                flexShrink: 0,
              }}
              aria-label="Fechar notificação"
            >
              ×
            </button>
          </div>
        );
      })}
      <style>{`
        @keyframes dropToastIn { from { opacity: 0; transform: translateX(40px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes dropToastPulse {
          0%, 100% { box-shadow: 0 10px 30px rgba(0,0,0,0.5), 0 0 12px #F59E0B55; }
          50% { box-shadow: 0 10px 30px rgba(0,0,0,0.5), 0 0 28px #F59E0Bcc; }
        }
      `}</style>
    </div>
  );
}
