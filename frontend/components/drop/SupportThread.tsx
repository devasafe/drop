import { FormEvent, useEffect, useState } from 'react';
import { Send } from 'lucide-react';
import api from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import { ScreenHeader } from './ScreenHeader';
import { MessageBubble } from './chat/MessageBubble';
import { Skeleton } from '../ui/Skeleton';
import styles from './SupportThread.module.css';

/** Conversa de um chamado de suporte (mesma API de mensagens do chat). */
export function SupportThread({ conversationId, subject, onBack }: { conversationId: string; subject: string; onBack: () => void }) {
  const { user } = useAuth() || ({} as any);
  const me = String(user?._id ?? user?.id ?? '');
  const [msgs, setMsgs] = useState<any[] | null>(null);
  const [text, setText] = useState('');
  useEffect(() => {
    let off = false;
    api.get(`/chat/conversations/${conversationId}/messages`)
      .then((r) => { if (!off) setMsgs(Array.isArray(r.data) ? r.data : r.data?.messages ?? []); })
      .catch(() => { if (!off) setMsgs([]); });
    return () => { off = true; };
  }, [conversationId]);
  const send = async (e: FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setText('');
    try {
      const r = await api.post(`/chat/conversations/${conversationId}/messages`, { text: body });
      setMsgs((m) => [...(m || []), r.data]);
    } catch {
      setText(body);
    }
  };
  return (
    <div className={styles.wrap}>
      <ScreenHeader title={subject} onBack={onBack} as="h2" />
      <div className={styles.thread} aria-live="polite">
        {msgs === null ? <Skeleton height={44} /> : msgs.length === 0
          ? <p className={styles.empty}>Conte o que aconteceu. A gente responde por aqui.</p>
          : msgs.map((m, i) => <MessageBubble key={m._id ?? i} message={m} isOwn={String(m.senderId) === me} />)}
      </div>
      <form className={styles.composer} onSubmit={send}>
        <input aria-label="Mensagem" placeholder="Mensagem" value={text} onChange={(e) => setText(e.target.value)} className={styles.input} maxLength={2000} />
        <button type="submit" className={styles.send} aria-label="Enviar" disabled={!text.trim()}><Send size={20} aria-hidden="true" /></button>
      </form>
    </div>
  );
}
